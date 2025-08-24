const { withTyping, runWithProgress, escapeMdV2 } = require("../utils/effects");
const db = require("../storage/db");

module.exports.register = async (bot) => {
  bot.command("unmacedon", async (ctx) => {
    // Снимать роль можно только админам (кроме bootstrap-режима, где админов ещё нет)
    if (ctx.app.admin.hasConfiguredAdmin && !ctx.app.admin.requireAdmin()) return;

    const raw = (ctx.message && ctx.message.text) || "";
    const arg = raw.split(" ").slice(1).join(" ").trim();

    if (!/^\d+$/.test(arg)) {
      await ctx.app.ui.show(ctx, "ℹ️ Использование:\n/unmacedon <user_id>", {
        reply_markup: { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "service_open" }]] }
      });
      return;
    }
    const targetId = Number(arg);

    await withTyping(ctx, async () => {
      const steps = Array.from({ length: 4 }, () => 160);
      await runWithProgress(ctx, steps, { render: ({ pct }) => `🧹 Снимаю права... ${pct}%` });
    }, { action: "typing" });

    // снимаем роль admin в БД
    db.setRole(targetId, "admin", false);

    const body = `🧹 Права администратора сняты: \`${escapeMdV2(String(targetId))}\`.`;
    await ctx.app.ui.show(ctx, body, {
      parse_mode: "MarkdownV2",
      reply_markup: { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "service_open" }]] }
    });
  });
};
