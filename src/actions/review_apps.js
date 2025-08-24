const { applications } = require('../storage/applications');
const { editOrReply } = require('../utils/helpers');

module.exports = {
  action: 'review_apps',
  handler: async (ctx) => {
    const pending = Object.values(applications).filter(u => u.status === 'pending');
    if (pending.length === 0) return editOrReply(ctx, 'Нет заявок.');
    const buttons = pending.map(u => [{
      text: `Одобрить ${u.username || u.id}`,
      callback_data: `approve_${u.id}`
    }, {
      text: `Отклонить ${u.username || u.id}`,
      callback_data: `reject_${u.id}`
    }]);
    buttons.push([{ text: '⬅ Назад', callback_data: 'back_admin' }]);
    await editOrReply(ctx, 'Заявки:', { reply_markup: { inline_keyboard: buttons } });
  }
};
