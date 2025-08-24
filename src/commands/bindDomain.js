module.exports.register = async (bot) => {
  bot.command("bind_domain", async (ctx) => {
    ctx.app.state.domain[ctx.from.id] = { awaiting: true };
    await ctx.app.ui.show(ctx, "🌐 Введите домен (пример: example.com)", {
      reply_markup: { inline_keyboard: [[{ text: "⬅️ Отмена", callback_data: "cancel_bind_domain" }]] }
    });
  });
};