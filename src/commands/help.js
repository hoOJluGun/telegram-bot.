module.exports.register = async (bot) => {
  bot.command("help", async (ctx) => {
    await ctx.app.ui.show(ctx, "❓ Помощь\n• /start — главное меню\n• /bind_domain — привязать домен\n• /inbox — входящие (только админ)");
  });
};