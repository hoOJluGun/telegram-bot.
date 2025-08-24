const { applications } = require('../storage/applications');

module.exports = {
  hear: 'Мои ссылки',
  handler: (ctx) => {
    const uid = ctx.from.id;
    const links = applications[uid]?.links || [];
    if (links.length === 0) return ctx.reply('У вас пока нет ссылок.');
    let text = 'Ваши ссылки:\n';
    links.forEach(l => {
      text += `${l.service} на ${l.amount}: ${l.link}\n`;
    });
    ctx.reply(text);
  }
};
