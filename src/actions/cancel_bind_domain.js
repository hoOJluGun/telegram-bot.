module.exports.register = async (bot) => {
  bot.action("cancel_bind_domain", async (ctx) => {
    delete ctx.app.state.domain[ctx.from.id];
    await ctx.app.ui.show(ctx, "❎ Отменено.");
    await ctx.answerCbQuery().catch(()=>{});
  });
};