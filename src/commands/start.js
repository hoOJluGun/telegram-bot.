const { applications } = require('../storage/applications');
const { userState } = require('../storage/state');

module.exports = (ctx) => {
  const uid = ctx.from.id;
  if (applications[uid]?.status === 'approved') {
    ctx.reply('Добро пожаловать!', { reply_markup: { keyboard: [[{ text: 'Выбрать сервис' }, { text: 'Мои ссылки' }]], resize_keyboard: true } });
  } else if (applications[uid]?.status === 'pending') {
    ctx.reply('Ваша заявка на рассмотрении.');
  } else {
    applications[uid] = { id: uid, username: ctx.from.username, status: 'pending', links: [] };
    ctx.reply('Ваша заявка отправлена на рассмотрение.');
  }
};
