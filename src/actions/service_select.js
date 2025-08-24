const { userState } = require('../storage/state');
const { retryRequest } = require('../utils/helpers');
module.exports = { action: /^service_(dopomoga|raif|oshchad|privat|viber)$/, handler: async (ctx) => {
  const map = { 'service_dopomoga': 'Допомога', 'service_raif': 'Райф', 'service_oshchad': 'Ощад', 'service_privat': 'Приват', 'service_viber': 'Вайбер' };
  const key = ctx.callbackQuery.data; const service = map[key]; if (!service) { await ctx.answerCbQuery('Сервис не найден'); return; }
  userState[ctx.from.id] = { awaitingAmount: true, service };
  await retryRequest(() => ctx.reply('Введите сумму:', { reply_markup: { inline_keyboard: [[{ text: 'Отмена', callback_data: 'cancel_amount' }]] } }));
  await ctx.answerCbQuery(); } };
