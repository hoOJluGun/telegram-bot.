const { userState } = require('../storage/state');
const { applications, saveApplications } = require('../storage/applications');

module.exports = async (ctx) => {
  const uid = ctx.from.id;
  if (userState[uid]?.waitingAmount) {
    const amount = ctx.message.text.trim();
    const service = userState[uid].service;
    const link = `https://pay.example.com/${service}?user=${uid}&amount=${amount}`;
    applications[uid].links = applications[uid].links || [];
    applications[uid].links.push({ service, amount, link });
    saveApplications();
    delete userState[uid].waitingAmount;
    ctx.reply(`Ссылка для оплаты: ${link}`);
  }
};
