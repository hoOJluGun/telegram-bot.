const { domainState } = require('../storage/state');
const { editOrReply } = require('../utils/helpers');

module.exports = {
  action: 'bind_domain',
  handler: async (ctx) => {
    domainState[ctx.from.id] = { waitingDomain: true };
    await editOrReply(ctx, 'Введите домен для привязки:', {
      reply_markup: { inline_keyboard: [[{ text: '⬅ Назад', callback_data: 'back_admin' }]] }
    });
  }
};
