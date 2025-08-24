const { userState } = require('./state');
const { generateLink } = require('./services');
const { applications, saveApplications } = require('./storage');
const { retryRequest } = require('./helpers');

function registerTextHandler(bot, handleTextMessage) {
  bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const messageText = ctx.message.text;

    if (userState[userId]?.awaitingAmount) {
      const amount = parseFloat(messageText);
      if (isNaN(amount) || amount <= 0) {
        await retryRequest(() =>
          ctx.reply('Пожалуйста, введите корректную сумму (положительное число).', {
            reply_markup: {
              inline_keyboard: [[{ text: 'Отмена', callback_data: 'cancel_amount' }]],
            },
          })
        );
        console.log(`Некорректная сумма от ${userId}: ${messageText}`);
        return;
      }

      const { service } = userState[userId];
      const link = generateLink(service, amount, userId);

      applications[userId] = applications[userId] || {};
      applications[userId].links = applications[userId].links || [];
      applications[userId].links.push({ service, amount, link, timestamp: new Date().toISOString() });
      saveApplications();

      await retryRequest(() => ctx.reply(`Ваша ссылка: ${link}`));
      console.log(`Ссылка создана для ${userId}: ${link}`);
      delete userState[userId];
      return;
    }

    await handleTextMessage(ctx);
  });
}

module.exports = { registerTextHandler };
