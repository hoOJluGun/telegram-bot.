module.exports.register = async (bot) => {
  const { withTyping, delay, sendDice } = require("../utils/effects");
  bot.command("dice", async (ctx) => {
    const text = (ctx.message && ctx.message.text) || "/dice";
    const arg = text.split(" ").slice(1).join(" ").trim();
    const allowed = ["🎲","🎯","🏀","⚽","🎰","🎳"];
    const emoji = allowed.includes(arg) ? arg : "🎲";
    await withTyping(ctx, async () => {
      await delay(300);
      await sendDice(ctx, emoji);
    }, { action: "choose_sticker" });
  });
};
