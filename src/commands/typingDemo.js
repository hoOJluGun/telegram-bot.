module.exports.register = async (bot) => {
  const { withTyping, delay } = require("../utils/effects");
  bot.command("typing_demo", async (ctx) => {
    await withTyping(ctx, async () => {
      await delay(1200);
      await ctx.app.ui.show(ctx, "⌨️ Печатал… Готово!");
    }, { action: "typing" });
  });
};
