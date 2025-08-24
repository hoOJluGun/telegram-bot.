const db = require("../storage/db");
module.exports.register = async (bot) => {
  bot.action("cancel_application", async (ctx) => {
    const u = db.getUser(ctx.from.id);
    if (u && u.awaitingApplicationText) db.setUser(ctx.from.id, { awaitingApplicationText: false });
    await ctx.app.ui.show(ctx, "❎ Отменено. Можешь вернуться к командам или /start.");
    try { await ctx.answerCbQuery(); } catch(e){}
  });
};
