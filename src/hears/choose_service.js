const { applications } = require('../storage/applications');
const { showServices } = require('../utils/ui');
module.exports = { hear: 'Выбрать сервис', handler: async (ctx) => {
  const userId = ctx.from.id; if (!applications[userId] || applications[userId].status !== 'approved') return ctx.reply('Ваша заявка не одобрена. Отправьте заявку через /start.');
  showServices(ctx);
} };
