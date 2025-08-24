module.exports.register = async (bot) => {
  bot.use(async (ctx, next) => {
    const u = ctx.from ? `${ctx.from.id} (@${ctx.from.username || "—"})` : "unknown";
    const type = ctx.updateType;
    let extra = "";
    if (type === "message") extra = ": " + (ctx.message?.text || ctx.message?.caption || "");
    if (type === "callback_query") extra = ": " + (ctx.callbackQuery?.data || "");
    console.log(`[${new Date().toISOString()}] ${u} ${type}${extra}`);
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
      `${i+1}. @${it.username || "—"} (${it.userId}) — ${it.firstName || ""} ${it.lastName || ""}\n» ${it.text}`);
    await ctx.app.ui.show(ctx, "📥 Входящие заявки:\n\n" + lines.join("\n\n"), {
      reply_markup: { inline_keyboard: [[{ text: "🧹 Очистить входящие", callback_data: "inbox_clear" }]] }
    });
  });

  bot.action("inbox_clear", async (ctx) => {
    if (String(ctx.from.id) !== String(ctx.app.adminChatId || "")) return ctx.answerCbQuery().catch(()=>{});
    ctx.app.state.inbox = [];
    await ctx.app.ui.show(ctx, "🧹 Входящие очищены.");
    await ctx.answerCbQuery().catch(()=>{});
  });
};