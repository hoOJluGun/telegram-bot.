const { Telegraf, Scenes, session } = require("telegraf");
const { loadModules } = require("./loader");
const { getCF } = require("./services/cloudflare");

// 0) Проверка переменных окружения


const BOT_TOKEN  = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID ? String(process.env.ADMIN_CHAT_ID) : null;
const IP_ADDRESS = process.env.IP_ADDRESS || "127.0.0.1";
if (!BOT_TOKEN) throw new Error("BOT_TOKEN отсутствует в .env");

let bot;

async function launchBot() {
  bot = new Telegraf(BOT_TOKEN, { handlerTimeout: 30_000 });

  // 1) Инициализация бота и Cloudflare
  

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
  "middlewares/userdb",     // ← онбординг + уведомления
  "middlewares/logging",
  "middlewares/auth",       // ← знает про bootstrap
  "middlewares/effects",

  "commands/start",
  "commands/admin",
  "commands/macedon",
  "commands/unmacedon",
  "commands/role",

  "actions/admin_panel",
  "actions/cancel_application",

  "commands/typingDemo",
  "commands/progressDemo",
  "commands/dice",
  "commands/formatDemo",

  "hears/domain_input",
  "scenes/bindDomainScene",
  "keyboards/mainMenu",
]);



  // 7) Обработка ошибок Telegram API
  

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

module.exports = { launchBot, stopBot };