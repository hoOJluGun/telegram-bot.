const { userState } = require('../storage/state');

module.exports = {
  action: /^service_(.+)$/,
  handler: async (ctx) => {
    const service = ctx.match[1];
    userState[ctx.from.id] = { waitingAmount: true, service };
    await ctx.editMessageText(`Введите сумму для сервиса ${service}:`, {
      reply_markup: { inline_keyboard: [[{ text: '⬅ Назад', callback_data: 'choose_service' }]] }
    });
  }
};
