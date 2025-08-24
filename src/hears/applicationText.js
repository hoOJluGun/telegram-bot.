const { applications, saveApplications } = require('../storage/applications');
const { retryRequest } = require('../utils/helpers');
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID ? String(process.env.ADMIN_CHAT_ID) : null;
module.exports = async (ctx) => {
  const userId = ctx.from.id; const username = ctx.from.username || 'Нет имени'; const firstName = ctx.from.first_name || ''; const lastName = ctx.from.last_name || ''; const message = ctx.message.text;
  const IGNORES = new Set(['Мои ссылки', 'Выбрать сервис']); if (IGNORES.has(message)) return;
  if (applications[userId] && applications[userId].status !== 'rejected') return ctx.reply('Вы уже подали заявку. Дождитесь решения.');
  applications[userId] = { status: 'pending', username, firstName, lastName, message, timestamp: new Date().toISOString(), messageId: null, links: [] };
  if (!ADMIN_CHAT_ID) { saveApplications(); return ctx.reply('Заявка принята локально, но админ-чат не настроен. Свяжитесь с админом.'); }
  try {
    const sent = await retryRequest(() => ctx.telegram.sendMessage(ADMIN_CHAT_ID, `Новая заявка от @${username} (${firstName} ${lastName}):\n${message}`, { reply_markup: { inline_keyboard: [[{ text: 'Добавить', callback_data: `approve_${userId}` }, { text: 'Отклонить', callback_data: `reject_${userId}` }]] } }));
    applications[userId].messageId = sent.message_id; saveApplications(); await ctx.reply('Ваша заявка отправлена на рассмотрение.');
  } catch { await ctx.reply('Ошибка отправки заявки. Попробуйте позже.'); }
};
