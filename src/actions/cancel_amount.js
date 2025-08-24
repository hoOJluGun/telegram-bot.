const { userState } = require('../storage/state');
module.exports = { action: 'cancel_amount', handler: async (ctx) => { delete userState[ctx.from.id]; await ctx.reply('Ввод суммы отменен.'); await ctx.answerCbQuery(); } };
