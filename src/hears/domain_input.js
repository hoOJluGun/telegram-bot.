const db = require("../storage/db");
const isValidUrl = require("../utils/validateUrl");

const MEDIA_TYPES = new Set([
  "photo","video","video_note","voice","audio","document","sticker","animation"
]);

function extractUrls(text){
  const raw = String(text||"").split(/[\s\n\r\t]+/).filter(Boolean);
  const cleaned = raw.map(t => t.replace(/^[(),.;:!?\[\]{}<>'"«»]+|[(),.;:!?\[\]{}<>'"«»]+$/g, ""));
  const uniq = Array.from(new Set(cleaned.filter(Boolean)));
  return uniq.filter(s => s.startsWith("http://") || s.startsWith("https://"));
}
function looksLikeCommand(text){
  return /^\s*\/\w+/.test(String(text||""));
}

module.exports.register = async (bot) => {
  bot.on(["text","photo","video","video_note","voice","audio","document","sticker","animation"], async (ctx, next) => {
    const userId = ctx.from.id;
    const u = db.getUser(userId) || {};
    const awaiting = ctx.app?.state?.awaitingApp?.[userId];

    // ждём заявку?
    if (awaiting) {
      const m = ctx.message;
      const kind = m?.photo ? "photo" :
                   m?.video ? "video" :
                   m?.video_note ? "video_note" :
                   m?.voice ? "voice" :
                   m?.audio ? "audio" :
                   m?.document ? "document" :
                   m?.sticker ? "sticker" :
                   m?.animation ? "animation" : "text";
      if (MEDIA_TYPES.has(kind)) {
        await ctx.app.ui.show(ctx,
          "🖼️ Изображения и файлы напрямую не принимаются.\n" +
          "Залейте на файлообменник и вставьте **ссылку** (http/https) в текст заявки.",
        );
        return;
      }

      const text = (m && m.text) ? String(m.text).trim() : "";
      if (!text) {
        await ctx.app.ui.show(ctx, "✍️ Пожалуйста, отправьте заявку **текстом**.");
        return;
      }
      // команды запрещены
      if (looksLikeCommand(text)) {
        await ctx.app.ui.show(ctx, "⛔ Команды в тексте заявки не принимаются. Напишите обычным текстом.");
        return;
      }
      // если есть ссылки — валидируем; храним всё равно как единый text
      const urls = extractUrls(text);
      const invalid = urls.filter(u => !isValidUrl(u));
      if (invalid.length) {
        await ctx.app.ui.show(ctx,
          "⚠️ Эти ссылки выглядят некорректно:\n" +
          invalid.map(s => `• ${s}`).join("\n") +
          "\n\nПроверьте формат (http/https) и отправьте заявку снова."
        );
        return;
      }

      if (db.hasApplication(userId)) {
        await ctx.app.ui.show(ctx, "ℹ️ Заявка уже отправлена. Дождитесь решения администраторов.");
        ctx.app.state.awaitingApp[userId] = false;
        return;
      }

      const isBootstrap = !ctx.app.admin?.hasConfiguredAdmin;
      const status = isBootstrap ? "approved" : "pending";
      db.createApplication(userId, text, status);
      if (isBootstrap) db.setRole(userId, "worker");

      ctx.app.state.awaitingApp[userId] = false;

      if (isBootstrap) {
        await ctx.app.ui.show(ctx,
          "✅ Заявка принята.\nРежим первоначальной настройки активен — можешь сразу открывать меню.",
          { reply_markup: { inline_keyboard: [[{ text: "🏠 Главное меню", callback_data: "open_main_menu_bootstrap" }]] } }
        );
        bot.action("open_main_menu_bootstrap", async (aCtx) => {
          const kb = [
            [{ text: "📌 Выбрать сервис", callback_data: "service_open" }],
            [{ text: "🔗 Мои ссылки", callback_data: "links_open" }],
            [{ text: "⚙️ Админка", callback_data: "admin_open" }],
          ];
          await aCtx.app.ui.show(aCtx, "🏠 Главное меню", { reply_markup: { inline_keyboard: kb } });
          await aCtx.answerCbQuery().catch(()=>{});
        });
      } else {
        await ctx.app.ui.show(ctx,
          "✅ Заявка принята.\n🕒 Ожидайте рассмотрения администраторами.",
          { reply_markup: { inline_keyboard: [[{ text: "🏠 Главное меню", callback_data: "open_main_menu_user" }]] } }
        );
        bot.action("open_main_menu_user", async (aCtx) => {
          const kb = [
            [{ text: "📌 Выбрать сервис", callback_data: "service_open" }],
            [{ text: "🔗 Мои ссылки", callback_data: "links_open" }],
          ];
          await aCtx.app.ui.show(aCtx, "🏠 Главное меню", { reply_markup: { inline_keyboard: kb } });
          await aCtx.answerCbQuery().catch(()=>{});
        });
      }
      return;
    }

    // если заявку уже отправляли — сообщаем статус
    const app = db.getApplication(userId);
    if (app) {
      if (app.status === "pending")      await ctx.app.ui.show(ctx, "🕒 Ваша заявка на рассмотрении. Ожидайте решения администраторов.");
      else if (app.status === "approved")await ctx.app.ui.show(ctx, "🎉 Ваша заявка одобрена. Наберите /start и приступайте к работе.");
      else                               await ctx.app.ui.show(ctx, "⛔ Ваша заявка отклонена.");
      return;
    }

    // пишет до /start — подскажем
    await ctx.app.ui.show(ctx, "👋 Чтобы присоединиться, начните с /start — бот запросит заявку.");
  });
};
