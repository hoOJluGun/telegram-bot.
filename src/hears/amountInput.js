const { userState } = require('../storage/state');
const { applications, saveApplications } = require('../storage/applications');
const { retryRequest } = require('../utils/helpers');
const { generateLink } = require('../services/links');
module.exports = async (ctx) => {
  const userId = ctx.from.id; const text = ctx.message.text?.trim();
  if (!userState[userId]?.awaitingAmount) return;
  const amount = parseFloat(text);
  if (isNaN(amount) || amount <= 0) { await retryRequest(() => ctx.reply('Пожалуйста, введите корректную сумму (положительное число).', { reply_markup: { inline_keyboard: [[{ text: 'Отмена', callback_data: 'cancel_amount' }]] } })); return; }
  const { service } = userState[userId]; const link = generateLink(service, amount, userId);
  applications[userId] = applications[userId] || {}; applications[userId].links = applications[userId].links || []; applications[userId].links.push({ service, amount, link, timestamp: new Date().toISOString() }); saveApplications();
  await retryRequest(() => ctx.reply(`Ваша ссылка: ${link}`)); delete userState[userId];
};
