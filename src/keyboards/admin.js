const { applications } = require('../storage/applications');
function buildAdminKeyboard() {
  const buttons = Object.entries(applications)
    .filter(([id, data]) => id !== 'admins' && id !== 'domains' && data?.username)
    .map(([id, data]) => {
      const isAdmin = data.admin === true;
      const marker = isAdmin ? '✅' : '❌';
      return [{ text: `${marker} @${data.username} (${id})`, callback_data: `toggle_admin_${id}` }];
    });
  return buttons.length ? buttons : [[{ text: 'Нет пользователей', callback_data: 'noop' }]];
}
module.exports = { buildAdminKeyboard };
