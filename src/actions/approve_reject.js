const { applications, saveApplications } = require('../storage/applications');

module.exports = {
  action: /^(approve|reject)_(.+)$/,
  handler: async (ctx) => {
    const [ , act, uid ] = ctx.match;
    if (!applications[uid]) return ctx.answerCbQuery('Пользователь не найден');
    applications[uid].status = act === 'approve' ? 'approved' : 'rejected';
    saveApplications();
    if (act === 'approve') {
      await ctx.telegram.sendMessage(uid, '✅ Ваша заявка одобрена!');
    } else {
      await ctx.telegram.sendMessage(uid, '❌ Ваша заявка отклонена.');
    }
    await ctx.editMessageText(`Заявка ${uid} ${act === 'approve' ? 'одобрена' : 'отклонена'}`);
  }
};
