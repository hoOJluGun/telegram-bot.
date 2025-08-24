const { domainState } = require('../storage/state');
const { applications } = require('../storage/applications');
const { retryRequest } = require('../utils/helpers');
const { readZone, addARecords } = require('../services/cloudflare');
function isAdminId(id) { return applications[id]?.admin === true; }
module.exports = { action: /^use_existing_zone_(.+?)_(.+)$/, handler: async (ctx) => {
  if (!isAdminId(ctx.from.id)) return ctx.answerCbQuery('Нет прав.');
  const data = ctx.callbackQuery.data.replace('use_existing_zone_', ''); const [domain, zoneId] = data.split('_');
  const ipAddress = '45.130.41.157'; await addARecords(zoneId, domain, ipAddress);
  const zone = await readZone(zoneId); domainState[ctx.from.id] = { domain, zoneId, nameservers: zone.name_servers, ipAddress };
  await retryRequest(() => ctx.reply(
    `Домен ${domain} привязан к существующей зоне!\n\n` +
    `Добавьте следующие NS-записи у регистратора:\n` +
    zone.name_servers.map((ns, i) => `${i + 1}. ${ns}`).join('\n') +
    `\n\nA-записи настроены на IP: ${ipAddress}.\n` +
    `После настройки NS нажмите "Проверить".`,
    { reply_markup: { inline_keyboard: [[{ text: 'Проверить', callback_data: `verify_domain_${domain}` }]] } }
  ));
  await ctx.answerCbQuery(); } };
