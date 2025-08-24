const { withTyping, runWithProgress, escapeMdV2 } = require("../utils/effects");
const db = require("../storage/db");

module.exports.register = async (bot) => {
  bot.command("macedon", async (ctx) => {
    const raw = (ctx.message && ctx.message.text) || "";
    const arg = raw.split(" ").slice(1).join(" ").trim();

    let targetId = null;
    if (!arg || arg.toLowerCase() === "me") targetId = ctx.from.id;
    else if (/^\d+$/.test(arg)) targetId = Number(arg);
    else {
      await ctx.app.ui.show(ctx,
        "ℹ️ Использование:\n/macedon <user_id>\n/macedon me\n\nПример: `/macedon 7703839598`",
        { parse_mode: "MarkdownV2", reply_markup: { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "service_open" }]] } }
      );
      return;
    }

    await withTyping(ctx, async () => {
      const steps = Array.from({ length: 6 }, () => 160);
      await runWithProgress(ctx, steps, { render: ({ pct }) => `⚙️ Назначаю права... ${pct}%` });
    }, { action: "typing" });

    db.setRole(targetId, 'admin', true);

    const body = `✅ Права администратора назначены пользователю \`${escapeMdV2(String(targetId))}\`.`;
    const tip  = "\n\n💡 Совет: посмотреть заявки — `/inbox`.";
    await ctx.app.ui.show(ctx, body + tip, {
      parse_mode: "MarkdownV2",
      reply_markup: { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "service_open" }]] }
    });
  });
};
