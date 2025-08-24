const { applications, saveApplications } = require('../storage/applications');

module.exports = {
  action: /^toggle_admin_(.+)$/,
  handler: async (ctx) => {
    const uid = ctx.match[1];
    applications[uid].admin = !applications[uid].admin;
    saveApplications();
    await ctx.answerCbQuery('Статус обновлён');
  }
};
