const { applications, saveApplications } = require('../storage/applications');

module.exports = (ctx) => {
  const parts = ctx.message.text.split(/\s+/);
  const targetId = parts[1];
  if (!targetId || !applications[targetId]) return ctx.reply('Пользователь не найден.');
  applications[targetId].admin = true;
  saveApplications();
  ctx.reply(`Пользователь ${targetId} назначен админом.`);
};
