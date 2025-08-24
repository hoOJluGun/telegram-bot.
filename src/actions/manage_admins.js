const { applications } = require('../storage/applications');
const { editOrReply } = require('../utils/helpers');

module.exports = {
  action: 'manage_admins',
  handler: async (ctx) => {
    const buttons = Object.keys(applications).map(uid => [{
      text: `${applications[uid].admin ? '✅' : '❌'} ${uid}`,
      callback_data: `toggle_admin_${uid}`
    }]);
    buttons.push([{ text: '⬅ Назад', callback_data: 'back_admin' }]);
    await editOrReply(ctx, 'Администраторы:', { reply_markup: { inline_keyboard: buttons } });
  }
};
