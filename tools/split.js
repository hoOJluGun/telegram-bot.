const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const MONO = path.join(ROOT, "bot.js"); // берём ИМЕННО корневой bot.js
if (!fs.existsSync(MONO)) {
  console.error("Не найден корневой bot.js. Положи монолит рядом и перезапусти.");
  process.exit(1);
}
const mono = fs.readFileSync(MONO, "utf8");

// ---------- helpers ----------
function ensure(p){ fs.mkdirSync(p, { recursive: true }); }
function write(p, s){ ensure(path.dirname(p)); fs.writeFileSync(p, s); console.log("write ", path.relative(ROOT,p)); }
function cleanHeader(block){
  if (!block) return "";
  const lines = block.split(/\r?\n/);
  if (lines[0]?.trim().startsWith("//")) lines.shift();
  return lines.join("\n").trim();
}
function escRe(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function grabBlock(n, title) {
  const re = new RegExp("^\\s*//\\s*" + n + "\\)\\s*" + escRe(title) + ".*$", "mi");
  const m = re.exec(mono);
  if (!m) return "";
  const start = m.index;
  const rest = mono.slice(start);
  const next = rest.search(/^\\s*\/\/\s*\d+\)\s.*$/m);
  return cleanHeader(next === -1 ? rest : rest.slice(0, next));
}
// вытащим блоки
const B = {
  env:   grabBlock(0, "Проверка переменных окружения"),
  init:  grabBlock(1, "Инициализация бота и Cloudflare"),
  files: grabBlock(2, "Работа с файлами"),
  admin: grabBlock(3, "Админы: Проверка и управление"),
  serv:  grabBlock(4, "Сервисные ссылки и генератор"),
  state: grabBlock(5, "Хранилище состояний"),
  misc:  grabBlock(6, "Общие хелперы"),
  tge:   grabBlock(7, "Обработка ошибок Telegram API"),
  app:   grabBlock(8, "Создание заявки из текста"),
  cmds:  grabBlock(9, "Команды"),
  acts:  grabBlock(10,"Callback-кнопки"),
  amt:   grabBlock(11,"Обработка ввода суммы"),
  myl:   grabBlock(12,"Обработка команды \"Мои ссылки\""),
  svc:   grabBlock(13,"Обработка команды \"Выбрать сервис\""),
  run:   grabBlock(14,"Запуск бота"),
};

// Разделим admin-блок на helpers и actions
let adminHelpers = "";
let adminActions = "";
if (B.admin) {
  const lines = B.admin.split(/\r?\n/);
  let buf=[], isAction=false, H=[], A=[];
  const push = (arr)=>{ if(buf.length){ arr.push(buf.join("\n")); buf=[]; } };
  for (const ln of lines) {
    if (/bot\.action\s*\(/.test(ln)) { push(isAction?A:H); isAction=true; }
    buf.push(ln);
    if (isAction && /\);\s*$/.test(ln)) { push(A); isAction=false; }
  }
  push(isAction?A:H);
  adminHelpers = H.join("\n\n").trim();
  adminActions = A.join("\n\n").trim();
}

// удалим любые сырьевые вызовы Telegram API: ctx.telegram.* / bot.telegram.*
// заменим их на добавление в inbox и/или ctx.app.ui.show
function stripTelegramAPI(src) {
  if (!src) return "";
  let out = src;

  // 1) Прямые отправки админам -> inbox push
  out = out.replace(/ctx\.telegram\.sendMessage\([^)]*\);?/g, (m) => {
    return `/* replaced: ${m.trim()} */
(function(ctx){
  const u = ctx.from||{};
  const text = ctx.message?.text || "";
  ctx.app.state.inbox = ctx.app.state.inbox || [];
  ctx.app.state.inbox.push({
    userId: u.id, username: u.username, firstName: u.first_name, lastName: u.last_name,
    text, at: new Date().toISOString()
  });
})(ctx);`;
  });

  // 2) Любые остальные обращения к ctx.telegram.* / bot.telegram.* — комментируем
  out = out.replace(/\b(ctx|bot)\.telegram\.[A-Za-z0-9_]+\(.*?\);?/gs, (m) => {
    return `/* removed raw Telegram API: ${m.trim()} */`;
  });

  return out;
}

// подготовим каталоги по ТЗ
const dirs = [
  "src",
  "src/middlewares",
  "src/commands",
  "src/actions",
  "src/hears",
  "src/scenes",
  "src/keyboards",
  "src/services",
  "src/utils",
];
dirs.forEach(d => ensure(path.join(ROOT, d)));

// --------- файлы ядра ----------
const TPL_index = `require("dotenv").config({ quiet: true });
const { launchBot, stopBot } = require("./bot");

(async () => {
  try {
    await launchBot();
    process.on("SIGINT", stopBot);
    process.on("SIGTERM", stopBot);
  } catch (err) {
    console.error("Ошибка запуска бота:", err);
    process.exit(1);
  }
})();`;

const TPL_loader = `const path = require("path");
module.exports.loadModules = async (bot, list) => {
  for (const rel of list) {
    const mod = require(path.join(__dirname, rel + ".js"));
    if (typeof mod.register !== "function") throw new Error("Модуль " + rel + " не экспортирует register(bot)");
    await mod.register(bot);
  }
};`;

// bot.js — Telegraf-only UI (редакта нет, делаем delete+reply)
const TPL_bot = `const { Telegraf, Scenes, session } = require("telegraf");
const { loadModules } = require("./loader");
const { getCF } = require("./services/cloudflare");

// 0) Проверка переменных окружения
${stripTelegramAPI(B.env)}

const BOT_TOKEN  = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID ? String(process.env.ADMIN_CHAT_ID) : null;
const IP_ADDRESS = process.env.IP_ADDRESS || "127.0.0.1";
if (!BOT_TOKEN) throw new Error("BOT_TOKEN отсутствует в .env");

let bot;

async function launchBot() {
  bot = new Telegraf(BOT_TOKEN, { handlerTimeout: 30_000 });

  // 1) Инициализация бота и Cloudflare
  ${stripTelegramAPI(B.init)}

  const stage = new Scenes.Stage([]);
  bot.use(session());
  bot.use(stage.middleware());

  const lastMsg = new Map();
  bot.context.app = {
    cf: getCF(),
    adminChatId: ADMIN_CHAT_ID,
    ip: IP_ADDRESS,
    state: { user:{}, domain:{}, inbox:[] },
    ui: {
      async show(ctx, text, options = {}) {
        const chatId = ctx.chat?.id;
        try {
          if (ctx.callbackQuery?.message?.message_id) {
            await ctx.editMessageText(text, options);
            lastMsg.set(chatId, ctx.callbackQuery.message.message_id);
          } else {
            const prev = lastMsg.get(chatId);
            if (prev) { try { await ctx.deleteMessage(prev); } catch(_){} }
            const sent = await ctx.reply(text, options);
            lastMsg.set(chatId, sent.message_id);
          }
        } catch (e) { console.error("ui.show:", e.message); }
      }
    }
  };

  bot.use((ctx, next) => { if (!ctx.app) ctx.app = bot.context.app; return next(); });

  await loadModules(bot, [
    "middlewares/session",
    "middlewares/logging",
    "middlewares/auth",
    "commands/start",
    "commands/help",
    "commands/bindDomain",
    "actions/bind_domain",
    "actions/cancel_bind_domain",
    "hears/domain_input",
    "scenes/bindDomainScene",
    "keyboards/mainMenu",
  ]);

  // 7) Обработка ошибок Telegram API
  ${stripTelegramAPI(B.tge)}

  bot.catch((err, ctx) => {
    console.error("Telegraf error:", err);
    ctx?.reply?.("😵 Произошла ошибка. Попробуйте позже.").catch(()=>{});
  });

  await bot.launch();
  console.log("Бот запущен");
  return bot;
}

async function stopBot() {
  if (!bot) return;
  console.log("Остановка бота...");
  await bot.stop("SIGTERM");
  console.log("Остановлен");
}

module.exports = { launchBot, stopBot };`;

// --------- middlewares ----------
const MW_session = `module.exports.register = async () => { /* встроенный session подключён в src/bot.js */ };`;

const MW_logging = `module.exports.register = async (bot) => {
  bot.use(async (ctx, next) => {
    const u = ctx.from ? \`\${ctx.from.id} (@\${ctx.from.username || "—"})\` : "unknown";
    const type = ctx.updateType;
    let extra = "";
    if (type === "message") extra = ": " + (ctx.message?.text || ctx.message?.caption || "");
    if (type === "callback_query") extra = ": " + (ctx.callbackQuery?.data || "");
    console.log(\`[\${new Date().toISOString()}] \${u} \${type}\${extra}\`);
    return next();
  });

  // /inbox — просмотр входящих заявок админом (Telegraf-only)
  bot.command("inbox", async (ctx) => {
    if (String(ctx.from.id) !== String(ctx.app.adminChatId || "")) {
      return ctx.reply("⛔ Только для администратора.").catch(()=>{});
    }
    const inbox = ctx.app.state.inbox || [];
    if (!inbox.length) return ctx.app.ui.show(ctx, "📭 Входящие пусты.");
    const lines = inbox.map((it, i) =>
      \`\${i+1}. @\${it.username || "—"} (\${it.userId}) — \${it.firstName || ""} \${it.lastName || ""}\\n» \${it.text}\`);
    await ctx.app.ui.show(ctx, "📥 Входящие заявки:\\n\\n" + lines.join("\\n\\n"), {
      reply_markup: { inline_keyboard: [[{ text: "🧹 Очистить входящие", callback_data: "inbox_clear" }]] }
    });
  });

  bot.action("inbox_clear", async (ctx) => {
    if (String(ctx.from.id) !== String(ctx.app.adminChatId || "")) return ctx.answerCbQuery().catch(()=>{});
    ctx.app.state.inbox = [];
    await ctx.app.ui.show(ctx, "🧹 Входящие очищены.");
    await ctx.answerCbQuery().catch(()=>{});
  });
};`;

const MW_auth = `module.exports.register = async (bot) => {
  bot.use(async (ctx, next) => {
    ctx.app.admin = ctx.app.admin || {
      isAdmin: () => String(ctx.from?.id||"") === String(ctx.app.adminChatId||""),
      requireAdmin: () => {
        const ok = String(ctx.from?.id||"") === String(ctx.app.adminChatId||"");
        if (!ok) ctx.reply("⛔ У вас нет прав.").catch(()=>{});
        return ok;
      }
    };
    return next();
  });
};`;

// --------- commands ----------
const CMD_start = stripTelegramAPI(B.cmds) || `module.exports.register = async (bot) => {
  bot.command("start", async (ctx) => {
    await ctx.app.ui.show(ctx, "👋 Привет! Я готов к работе. Выберите действие ниже.", {
      reply_markup: { inline_keyboard: [
        [{ text: "📌 Выбрать сервис", callback_data: "service_open" }],
        [{ text: "🔗 Мои ссылки", callback_data: "links_open" }]
      ] }
    });
  });
};`;

const CMD_help = `module.exports.register = async (bot) => {
  bot.command("help", async (ctx) => {
    await ctx.app.ui.show(ctx, "❓ Помощь\\n• /start — главное меню\\n• /bind_domain — привязать домен\\n• /inbox — входящие (только админ)");
  });
};`;

const CMD_bind = `module.exports.register = async (bot) => {
  bot.command("bind_domain", async (ctx) => {
    ctx.app.state.domain[ctx.from.id] = { awaiting: true };
    await ctx.app.ui.show(ctx, "🌐 Введите домен (пример: example.com)", {
      reply_markup: { inline_keyboard: [[{ text: "⬅️ Отмена", callback_data: "cancel_bind_domain" }]] }
    });
  });
};`;

// --------- actions ----------
const ACT_bind = stripTelegramAPI(B.acts) || `module.exports.register = async (bot) => {
  bot.action("service_open", async (ctx) => {
    await ctx.app.ui.show(ctx, "🧰 Выберите сервис:", {
      reply_markup: { inline_keyboard: [
        [{ text: "1 • Допомога", callback_data: "service_dopomoga" }, { text: "2 • Райф", callback_data: "service_raif" }],
        [{ text: "3 • Ощад", callback_data: "service_oshchad" }, { text: "4 • Приват", callback_data: "service_privat" }],
        [{ text: "5 • Вайбер", callback_data: "service_viber" }]
      ] }
    });
    await ctx.answerCbQuery().catch(()=>{});
  });

  bot.action(/service_(dopomoga|raif|oshchad|privat|viber)/, async (ctx) => {
    const map = { dopomoga:"Допомога", raif:"Райф", oshchad:"Ощад", privat:"Приват", viber:"Вайбер" };
    const service = map[ctx.match[1]];
    ctx.app.state.user[ctx.from.id] = { awaitingAmount: true, service };
    await ctx.app.ui.show(ctx, "💳 Введите сумму для сервиса: " + service, {
      reply_markup: { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "service_open" }]] }
    });
    await ctx.answerCbQuery().catch(()=>{});
  });

  bot.action("links_open", async (ctx) => {
    await ctx.app.ui.show(ctx, "🗂️ Здесь появятся ваши ссылки.");
    await ctx.answerCbQuery().catch(()=>{});
  });
};`;

const ACT_cancel = `module.exports.register = async (bot) => {
  bot.action("cancel_bind_domain", async (ctx) => {
    delete ctx.app.state.domain[ctx.from.id];
    await ctx.app.ui.show(ctx, "❎ Отменено.");
    await ctx.answerCbQuery().catch(()=>{});
  });
};`;

// --------- hears/text ----------
const HEAR_text = `const validateDomain = require("../utils/validateDomain");
module.exports.register = async (bot) => {
  bot.on("text", async (ctx, next) => {
    const userId = ctx.from.id;
    const txt = ctx.message.text || "";
    const ds = ctx.app.state.domain[userId];

    // 11) сумма?
    const us = ctx.app.state.user[userId];
    if (us?.awaitingAmount) {
      const amount = parseFloat(txt.replace(",", "."));
      if (isNaN(amount) || amount <= 0) {
        await ctx.app.ui.show(ctx, "💳 Введите корректную сумму, например: 199.99");
        return;
      }
      const link = \`https://example.com/pay?service=\${us.service}&amount=\${amount}\`;
      await ctx.app.ui.show(ctx, "🔗 Ваша ссылка:\\n" + link);
      delete ctx.app.state.user[userId];
      return;
    }

    // 8) «заявка» — кладём во входящие админа
    if (!ds?.awaiting) {
      ctx.app.state.inbox.push({
        userId, username: ctx.from.username, firstName: ctx.from.first_name, lastName: ctx.from.last_name, text: txt,
        at: new Date().toISOString()
      });
      await ctx.app.ui.show(ctx, "✅ Заявка отправлена. Администратор увидит её в /inbox.");
      return;
    }

    // привязка домена
    const d = txt.trim().toLowerCase();
    if (!validateDomain(d)) {
      await ctx.app.ui.show(ctx, "✍️ Введите домен в формате: example.com");
      return;
    }
    await ctx.app.ui.show(ctx, "✅ Принял домен: " + d);
    delete ctx.app.state.domain[userId];
  });
};`;

// --------- scenes / keyboards (заглушки) ----------
const SCENE_bind = `module.exports.register = async () => { /* при необходимости перенесёшь в WizardScene */ };`;
const KB_main   = `module.exports.register = async () => { /* главное меню собираем в /start */ };`;

// --------- services/utils ----------
const SVC_cloudflare = `const Cloudflare = require("cloudflare");
function getCF(){ const t = process.env.CLOUDFLARE_API_TOKEN; if(!t) throw new Error("CLOUDFLARE_API_TOKEN отсутствует в .env"); return new Cloudflare({ token: t }); }
module.exports = { getCF };`;

const UT_validate = `module.exports = function validateDomain(domain){
  return /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9](?:\\.[a-z]{2,})+$/i.test(domain||"");
};`;

// --------- write files ----------
write(path.join(ROOT,"src/index.js"), TPL_index);
write(path.join(ROOT,"src/loader.js"), TPL_loader);
write(path.join(ROOT,"src/bot.js"),    TPL_bot);

write(path.join(ROOT,"src/middlewares/session.js"),  MW_session);
write(path.join(ROOT,"src/middlewares/logging.js"),  MW_logging);
write(path.join(ROOT,"src/middlewares/auth.js"),     MW_auth);

write(path.join(ROOT,"src/commands/start.js"),       CMD_start);
write(path.join(ROOT,"src/commands/help.js"),        CMD_help);
write(path.join(ROOT,"src/commands/bindDomain.js"),  CMD_bind);

write(path.join(ROOT,"src/actions/bind_domain.js"),      ACT_bind);
write(path.join(ROOT,"src/actions/cancel_bind_domain.js"), ACT_cancel);

write(path.join(ROOT,"src/hears/domain_input.js"),   HEAR_text);

write(path.join(ROOT,"src/scenes/bindDomainScene.js"), SCENE_bind);
write(path.join(ROOT,"src/keyboards/mainMenu.js"),     KB_main);

write(path.join(ROOT,"src/services/cloudflare.js"),  SVC_cloudflare);
write(path.join(ROOT,"src/utils/validateDomain.js"), UT_validate);

console.log("\\n✅ Split завершён. Все сырые Telegram API-вызовы вычищены/заменены.");
