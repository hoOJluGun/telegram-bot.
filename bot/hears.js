const { applications, saveApplications } = require('./storage');
const { userState } = require('./state');
const { generateLink, showServices, retryRequest } = require('./helpers');

module.exports = (bot, handleTextMessage) => {
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

  bot.hears('Мои ссылки', async (ctx) => {
    const userId = ctx.from.id;
    if (!applications[userId] || applications[userId].status !== 'approved') {
      return ctx.reply('У вас нет одобренных заявок или ссылок.');
    }

    const links = applications[userId].links || [];
    if (!links.length) {
      return ctx.reply('У вас пока нет ссылок.');
    }

    const linksText = links
      .map((link, index) => `${index + 1}. ${link.service} - ${link.amount} - ${link.link} (${link.timestamp})`)
      .join('\n');
    await ctx.reply(`Ваши ссылки:\n${linksText}`);
  });

  bot.hears('Выбрать сервис', async (ctx) => {
    const userId = ctx.from.id;
    if (!applications[userId] || applications[userId].status !== 'approved') {
      return ctx.reply('Ваша заявка не одобрена. Отправьте заявку через /start.');
    }
    showServices(ctx);
  });
};
