const { domainState } = require('../storage/state');
module.exports = { action: 'cancel_bind_domain', handler: async (ctx) => { delete domainState[ctx.from.id]; await ctx.reply('Привязка домена отменена.'); await ctx.answerCbQuery(); } };
