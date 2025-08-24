const { domainState } = require('../storage/state');
const { applications, saveApplications } = require('../storage/applications');
const { retryRequest } = require('../utils/helpers');
const { readZone, listDns } = require('../services/cloudflare');
function isAdminId(id) { return applications[id]?.admin === true; }
module.exports = { action: /^verify_domain_(.+)$/, handler: async (ctx) => {
  const userId = ctx.from.id; const domain = ctx.callbackQuery.data.replace('verify_domain_', '');
  if (!isAdminId(userId) || !domainState[userId]?.zoneId) { await ctx.answerCbQuery('Ошибка: некорректный запрос.'); return; }
  const { zoneId, nameservers } = domainState[userId]; const ipAddress = domainState[userId]?.ipAddress || '45.130.41.157';
  try {
    const zone = await readZone(zoneId);
    if (zone.status !== 'active') {
      await retryRequest(() => ctx.reply(
        `Домен ${domain} ещё не активен. Проверьте NS у регистратора:\n` +
        nameservers.map((ns, i) => `${i + 1}. ${ns}`).join('\n') +
        `\n\nПопробуйте снова через 5–10 минут.`,
        { reply_markup: { inline_keyboard: [[{ text: 'Проверить снова', callback_data: `verify_domain_${domain}` }]] } }
      ));
      return;
    }
    applications.domains = applications.domains || {};
    applications.domains[domain] = { ownerId: String(userId), ownerUsername: ctx.from.username || 'Нет имени', addedAt: new Date().toISOString(), active: true, verified: true, nameservers };
    saveApplications();
    const records = await listDns(zoneId); let out = `📜 DNS-записи для ${domain}:\n`; for (const r of records) out += `• ${r.type} ${r.name} → ${r.content} (TTL ${r.ttl})\n`; await ctx.reply(out);
    await retryRequest(() => ctx.reply(
      `Домен ${domain} успешно привязан!\n\n` +
      `A-записи на IP: ${ipAddress}.\n` +
      `NS-записи:\n` +
      nameservers.map((ns, i) => `${i + 1}. ${ns}`).join('\n') +
      `\n\nДомен готов к использованию в ссылках.`
    ));
    delete domainState[userId]; await ctx.answerCbQuery();
  } catch (e) {
    await retryRequest(() => ctx.reply(
      `Ошибка при привязке домена ${domain}. Проверьте DNS или API-токен.`,
      { reply_markup: { inline_keyboard: [[{ text: 'Проверить снова', callback_data: `verify_domain_${domain}` }]] } }
    ));
  }
} };
