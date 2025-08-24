const { domainState } = require('../storage/state');
const { ensureZone, addARecord } = require('../services/cloudflare');

module.exports = async (ctx) => {
  const uid = ctx.from.id;
  if (domainState[uid]?.waitingDomain) {
    const domain = ctx.message.text.trim();
    try {
      const zone = await ensureZone(domain);
      await addARecord(zone.id, domain, '1.2.3.4'); // сюда подставь свой IP
      ctx.reply(`Домен ${domain} успешно привязан через Cloudflare.`);
    } catch (err) {
      ctx.reply('Ошибка при привязке домена: ' + err.message);
    }
    delete domainState[uid].waitingDomain;
  }
};
