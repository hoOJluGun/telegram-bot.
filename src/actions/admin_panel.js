const db = require("../storage/db");

function isAdmin(ctx){ return (db.getUser(ctx.from.id)?.role === "admin"); }

const PAGE = 7;
const STATUSES = ["all","pending","approved","rejected"];

const S = {
  pending:  "🕒 Ожидает",
  approved: "✅ Одобрена",
  rejected: "⛔ Отклонена"
};

function userLine(u, idx){
  const parts = [];
  const roleBadge = u.role ? `【${u.role}】` : "【—】";
  parts.push(`${idx}. ${roleBadge} ${u.tag || u.name || u.id}`);
  if (u.name && u.tag && u.tag !== u.name) parts.push(`   👤 ${u.name}`);
  if (u.application?.text) {
    const txt = String(u.application.text).slice(0, 400);
    parts.push(`   📜 ${txt}`);
  }
  if (u.application?.status) parts.push(`   ${S[u.application.status] || u.application.status}`);
  return parts.join('\n');
}

function tabsRow(active){
  return [
    { text: active==="all"?"• All":"All", callback_data: "admin_apps:list:all:0" },
    { text: active==="pending"?"• Pending":"Pending", callback_data: "admin_apps:list:pending:0" },
    { text: active==="approved"?"• Approved":"Approved", callback_data: "admin_apps:list:approved:0" },
    { text: active==="rejected"?"• Rejected":"Rejected", callback_data: "admin_apps:list:rejected:0" }
  ];
}

async function showMain(ctx){
  await ctx.app.ui.show(ctx, "⚙️ Админ-панель", {
    reply_markup: { inline_keyboard: [
      [{ text: "📥 Заявки",  callback_data: "admin_apps:list:pending:0" }],
      [{ text: "👥 Админы",  callback_data: "admin_users:list:admin:0" }],
      [{ text: "🛎 Сапорты", callback_data: "admin_users:list:support:0" }],
      [{ text: "🧭 Наставничество", callback_data: "admin_mentorship" }],
      [{ text: "⬅️ Назад", callback_data: "service_open" }]
    ] }
  });
}

async function showApps(ctx, status="pending", page=0){
  const s = String(status).toLowerCase();
  const safe = STATUSES.includes(s) ? s : "pending";
  const all = db.listApplications(safe);
  const total = all.length;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const p = Math.min(Math.max(0, parseInt(page||0,10)), pages-1);
  const start = p*PAGE;
  const slice = all.slice(start, start+PAGE);

  const body = !total
    ? "📭 Заявок не найдено."
    : slice.map((u,i)=> userLine(u, start+i+1)).join("\n\n");

  const ik = [];
  ik.push(tabsRow(safe));

  if (slice.length) {
    for (let i = 0; i < slice.length; i++) {
      const u = slice[i];
      const idx = start + i + 1;
      ik.push([{ text: `↔️ Toggle #${idx}`, callback_data: `admin_app_toggle:${u.id}:${safe}:${p}` }]);
    }
  } else {
    ik.push([{ text:"—", callback_data:"noop" }]);
  }

  const nav = [];
  if (p>0) nav.push({ text: "⬅️ Prev", callback_data: `admin_apps:list:${safe}:${p-1}` });
  nav.push({ text: `Стр. ${p+1}/${pages}`, callback_data: "noop" });
  if (p<pages-1) nav.push({ text: "Next ➡️", callback_data: `admin_apps:list:${safe}:${p+1}` });
  ik.push(nav);

  ik.push([{ text: "⬅️ Назад", callback_data: "admin_open" }]);

  await ctx.app.ui.show(ctx, `📥 Заявки (${safe.toUpperCase()}) • всего: ${total}\n\n${body}`, {
    reply_markup: { inline_keyboard: ik }
  });
}

async function showUsersByRole(ctx, role="admin", page=0){
  const users = db.listUsers();
  const total = users.length;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const p = Math.min(Math.max(0, parseInt(page||0,10)), pages-1);
  const start = p*PAGE;
  const slice = users.slice(start, start+PAGE);

  const title = role === "admin" ? "👥 Админы" : role === "support" ? "🛎 Сапорты" : `👤 ${role}`;
  const body = !total
    ? "🗂 Пусто."
    : slice.map((u,i)=>{
        const on = (u.role === role);
        return `${start+i+1}. [${role}:${on?"on":"off"}] ${u.tag || u.name || u.id}`;
      }).join("\n");

  const ik = [];
  if (slice.length) {
    for (let i = 0; i < slice.length; i++) {
      const u = slice[i];
      const idx = start + i + 1;
      ik.push([{ text: `↔️ Toggle #${idx}`, callback_data: `admin_user_toggle:${role}:${u.id}:${p}` }]);
    }
  } else {
    ik.push([{ text:"—", callback_data:"noop" }]);
  }

  const nav = [];
  if (p>0) nav.push({ text: "⬅️ Prev", callback_data: `admin_users:list:${role}:${p-1}` });
  nav.push({ text: `Стр. ${p+1}/${pages}`, callback_data: "noop" });
  if (p<pages-1) nav.push({ text: "Next ➡️", callback_data: `admin_users:list:${role}:${p+1}` });
  ik.push(nav);

  ik.push([{ text: "⬅️ Назад", callback_data: "admin_open" }]);

  await ctx.app.ui.show(ctx, `${title} • всего: ${total}\n\n${body}`, {
    reply_markup: { inline_keyboard: ik }
  });
}

module.exports.register = async (bot) => {
  bot.action("admin_open", async (ctx) => {
    if (db.getUser(ctx.from.id)?.role !== "admin") { await ctx.answerCbQuery().catch(()=>{}); return; }
    await showMain(ctx); await ctx.answerCbQuery().catch(()=>{});
  });

  bot.action(/^admin_apps:list:(all|pending|approved|rejected):(\d+)$/, async (ctx) => {
    if (db.getUser(ctx.from.id)?.role !== "admin") { await ctx.answerCbQuery().catch(()=>{}); return; }
    const status = ctx.match[1], page = parseInt(ctx.match[2],10)||0;
    await showApps(ctx, status, page); await ctx.answerCbQuery().catch(()=>{});
  });

  bot.action(/admin_app_toggle:(\d+):(all|pending|approved|rejected):(\d+)/, async (ctx) => {
    if (db.getUser(ctx.from.id)?.role !== "admin") { await ctx.answerCbQuery().catch(()=>{}); return; }
    const userId = ctx.match[1], tab = ctx.match[2], page = parseInt(ctx.match[3],10)||0;

    const app = db.getApplication(userId);
    if (!app) {
      await ctx.app.ui.show(ctx, "⚠️ У пользователя нет заявки.");
      await ctx.answerCbQuery().catch(()=>{});
      return;
    }
    let next = "approved";
    if (app.status === "approved") next = "rejected";
    else if (app.status === "rejected") next = "approved";
    db.setApplicationStatus(userId, next);

    try {
      if (next === "approved") await ctx.telegram.sendMessage(Number(userId), "🎉 Вас одобрили. Наберите /start и приступайте к работе.");
      else await ctx.telegram.sendMessage(Number(userId), "⛔ Ваша заявка отклонена.");
    } catch(_) {}

    await showApps(ctx, tab, page); await ctx.answerCbQuery().catch(()=>{});
  });

  bot.action(/^admin_users:list:(admin|support):(\d+)$/, async (ctx) => {
    if (db.getUser(ctx.from.id)?.role !== "admin") { await ctx.answerCbQuery().catch(()=>{}); return; }
    const role = ctx.match[1], page = parseInt(ctx.match[2],10)||0;
    await showUsersByRole(ctx, role, page); await ctx.answerCbQuery().catch(()=>{});
  });

  bot.action(/^admin_user_toggle:(admin|support):(\d+):(\d+)$/, async (ctx) => {
    if (db.getUser(ctx.from.id)?.role !== "admin") { await ctx.answerCbQuery().catch(()=>{}); return; }
    const role = ctx.match[1], userId = ctx.match[2], page = parseInt(ctx.match[3],10)||0;

    const u = db.getUser(userId);
    const nextRole = (u?.role === role) ? undefined : role;
    db.setRole(userId, nextRole);

    try {
      await ctx.telegram.sendMessage(Number(userId),
        nextRole ? `✅ Назначена роль "${role}".` : `🧹 Роль "${role}" снята.`
      );
    } catch(_) {}

    await showUsersByRole(ctx, role, page); await ctx.answerCbQuery().catch(()=>{});
  });

  bot.action("admin_mentorship", async (ctx) => {
    if (db.getUser(ctx.from.id)?.role !== "admin") { await ctx.answerCbQuery().catch(()=>{}); return; }
    await ctx.app.ui.show(ctx, "🧭 Наставничество\n\nВ разработке.", {
      reply_markup: { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "admin_open" }]] }
    });
    await ctx.answerCbQuery().catch(()=>{});
  });
};
