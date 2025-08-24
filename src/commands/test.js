const { retryRequest } = require('../utils/helpers');

module.exports = async (ctx) => {
  await ctx.reply('Тест: бот работает!');
  const adminChatId = process.env.ADMIN_CHAT_ID;
  if (adminChatId) {
    await retryRequest(() => ctx.telegram.sendMessage(adminChatId, `Тест от @${ctx.from.username || ctx.from.id}`));
  }
};
