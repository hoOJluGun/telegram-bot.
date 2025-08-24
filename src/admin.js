const crypto = require('crypto');
const { applications } = require('./storage');

const isAdminId = (id) => applications[id]?.admin === true;

const requireAdmin = (ctx) => {
  if (!isAdminId(ctx.from.id)) {
    ctx.reply('У вас нет прав. Только администраторы могут использовать эту команду.');
    return false;
  }
  return true;
};

const callbackCache = new Map();
const addToCallbackCache = (key) => {
  const now = Date.now();
  if (callbackCache.has(key)) {
    const timestamp = callbackCache.get(key);
    if (now - timestamp < 5000) {
      console.log(`Пропущен дублирующий callback: ${key}`);
      return false;
    }
  }
  callbackCache.set(key, now);
  setTimeout(() => callbackCache.delete(key), 5000);
  return true;
};

const buildAdminKeyboard = () => {
  const buttons = Object.entries(applications)
    .filter(([id, data]) => id !== 'admins' && id !== 'domains' && data?.username)
    .map(([id, data]) => {
      const isAdmin = data.admin === true;
      const marker = isAdmin ? '✅' : '❌';
      return [{ text: `${marker} @${data.username} (${id})`, callback_data: `toggle_admin_${id}` }];
    });
  return buttons.length ? buttons : [[{ text: 'Нет пользователей', callback_data: 'noop' }]];
};

module.exports = {
  isAdminId,
  requireAdmin,
  addToCallbackCache,
  buildAdminKeyboard,
};
