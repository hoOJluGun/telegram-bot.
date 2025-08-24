module.exports.register = async (bot) => {
  const { runWithProgress } = require("../utils/effects");
  bot.command("progress_demo", async (ctx) => {
    const steps = Array.from({ length: 10 }, () => 300);
    await runWithProgress(ctx, steps, { render: ({ pct }) => `⏳ Обработка: ${pct}%` });
  });
};
