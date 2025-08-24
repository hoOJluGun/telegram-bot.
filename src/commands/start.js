const db = require("../storage/db");

module.exports.register = async (bot) => {
  bot.command("start", async (ctx) => {
    // создаём/обновляем «чистого» пользователя (только id, name, username, tag, role?, application?)
    db.upsertUser(ctx.from);

    const u = db.getUser(ctx.from.id);
    const app = u && u.application;

    if (app) {
      const kb = [
        [{ text: "📌 Выбрать сервис", callback_data: "service_open" }],
        [{ text: "🔗 Мои ссылки", callback_data: "links_open" }],
      ];
      if (u.role === "admin") kb.unshift([{ text: "⚙️ Админка", callback_data: "admin_open" }]);
      await ctx.app.ui.show(ctx, "🏠 Главное меню", { reply_markup: { inline_keyboard: kb } });
      return;
    }

    // ждём заявку
    ctx.app.state.awaitingApp = ctx.app.state.awaitingApp || {};
    ctx.app.state.awaitingApp[ctx.from.id] = true;

    await ctx.app.ui.show(ctx,
      "📝 Добро пожаловать! Напишите **заявку** о себе (обычным текстом).\n" +
      "Если нужно — вставьте ссылки (http/https). Команды запрещены.",
      { parse_mode: "MarkdownV2",
        reply_markup: { inline_keyboard: [[{ text: "⬅️ Отмена", callback_data: "cancel_application" }]] } }
    );
  });

  bot.action("cancel_application", async (ctx) => {
    ctx.app.state.awaitingApp = ctx.app.state.awaitingApp || {};
    ctx.app.state.awaitingApp[ctx.from.id] = false;
    await ctx.app.ui.show(ctx, "❎ Заполнение заявки отменено. Наберите /start, чтобы начать заново.");
    await ctx.answerCbQuery().catch(()=>{});
  });
};
