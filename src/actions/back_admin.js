const { editOrReply } = require('../utils/helpers');

module.exports = {
  action: 'back_admin',
  handler: async (ctx) => {
    await editOrReply(ctx, 'Выберите действие:', {
      reply_markup: {
        inline_keyboard: [
          [ { text: 'Добавить домен', callback_data: 'bind_domain' }, { text: 'Администраторы', callback_data: 'manage_admins' } ],
          [ { text: 'Заявки', callback_data: 'review_apps' } ],
          [ { text: 'Сервисы', callback_data: 'choose_service' } ]
        ]
      }
    });
  }
};
