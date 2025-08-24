const { withTyping, runWithProgress, escapeMdV2 } = require("../utils/effects");
const db = require("../storage/db");

const ROLES = new Set(['worker','admin','mentor','vbiv']);

module.exports.register = async (bot) => {
  bot.command("role", async (ctx) => {
    // защитим редактирование ролей (кроме bootstrap)
    if (ctx.app.admin.hasConfiguredAdmin && !ctx.app.admin.requireAdmin()) return;

    const raw = (ctx.message && ctx.message.text) || "";
    const args = raw.trim().split(/\s+/).slice(1);
    // варианты:
    // /role me mentor on
    // /role 7703839598 worker off
    if (!args.length || args.length < 2) {
      await ctx.app.ui.show(ctx,
        "ℹ️ Использование:\n/role <id|me> <worker|admin|mentor|vbiv> [on|off]\n\nПример:\n/role me mentor on\n/role 7703839598 vbiv on",
        { reply_markup: { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "service_open" }]] } }
      );
      return;
    }
    const who = args[0];
    const role = args[1].toLowerCase();
    const onoff = (args[2] || 'on').toLowerCase() === 'on';

    if (!ROLES.has(role)) {
      await ctx.app.ui.show(ctx, "Неизвестная роль: " + role);
      return;
    }
    const targetId = who === 'me' ? ctx.from.id : (/^\d+$/.test(who) ? Number(who) : null);
    if (!targetId) {
      await ctx.app.ui.show(ctx, "Укажи корректный id или me");
      return;
    }

    await withTyping(ctx, async () => {
      const steps = Array.from({ length: 4 }, () => 120);
      await runWithProgress(ctx, steps, { render: ({ pct }) => `🛠️ Применяю роль... ${pct}%` });
    }, { action: "typing" });

    try {
      const user = db.setRole(targetId, role, onoff);
      await ctx.app.ui.show(ctx,
        `✅ Роль \`${role}\` для \`${escapeMdV2(String(targetId))}\` => **${onoff ? 'ON' : 'OFF'}**`,
        { parse_mode: "MarkdownV2" }
      );
    } catch (e) {
      await ctx.app.ui.show(ctx, "Ошибка: " + e.message);
    }
  });
};
