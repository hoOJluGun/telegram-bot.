const { editOrReply } = require('../utils/helpers');

module.exports = {
  action: 'choose_service',
  handler: async (ctx) => {
    await editOrReply(ctx, 'Выберите сервис:', {
      reply_markup: {
        inline_keyboard: [
          [ { text: 'Privat', callback_data: 'service_privat' }, { text: 'Raif', callback_data: 'service_raif' } ],
          [ { text: 'Oschad', callback_data: 'service_oschad' }, { text: 'Viber', callback_data: 'service_viber' } ],
          [ { text: '⬅ Назад', callback_data: 'back_admin' } ]
        ]
      }
    });
  }
};
