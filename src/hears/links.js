const { applications } = require('../storage/applications');
module.exports = { hear: 'Мои ссылки', handler: async (ctx) => {
  const userId = ctx.from.id; if (!applications[userId] || applications[userId].status !== 'approved') return ctx.reply('У вас нет одобренных заявок или ссылок.');
  const links = applications[userId].links || []; if (!links.length) return ctx.reply('У вас пока нет ссылок.');
  const text = links.map((l, i) => `${i + 1}. ${l.service} - ${l.amount} - ${l.link} (${l.timestamp})`).join('\n'); await ctx.reply(`Ваши ссылки:\n${text}`);
} };
