const { domainState } = require('../storage/state');
const { applications } = require('../storage/applications');
const { retryRequest } = require('../utils/helpers');
const { findZoneByName, createZone, addARecords } = require('../services/cloudflare');
function isAdminId(id) { return applications[id]?.admin === true; }
module.exports = async (ctx) => {
  const userId = ctx.from.id; const message = ctx.message.text?.trim().toLowerCase();
  if (!domainState[userId]?.awaitingDomain) return;
  const valid = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+$/;
  if (!valid.test(message)) { await retryRequest(() => ctx.reply('Некорректный домен. Введите домен в формате example.com или pburarai.biz.ua:', { reply_markup: { inline_keyboard: [[{ text: 'Отмена', callback_data: 'cancel_bind_domain' }]] } })); return; }
  if (applications.domains?.[message]) { await retryRequest(() => ctx.reply(`Домен ${message} уже зарегистрирован пользователем @${applications.domains[message].ownerUsername || 'Неизвестно'}.`)); delete domainState[userId]; return; }
  const existing = await findZoneByName(message);
  if (existing) { domainState[userId] = { domain: message, zoneId: existing.id, nameservers: existing.name_servers }; await retryRequest(() => ctx.reply(`Домен ${message} уже существует в Cloudflare (zoneId: ${existing.id}). Использовать его?`, { reply_markup: { inline_keyboard: [[{ text: 'Да', callback_data: `use_existing_zone_${message}_${existing.id}` }], [{ text: 'Нет, выбрать другой', callback_data: 'cancel_bind_domain' }] ] } })); return; }
  try {
    const zone = await createZone(message); const zoneId = zone.id; const nameservers = zone.name_servers; const ipAddress = '45.130.41.157'; await addARecords(zoneId, message, ipAddress);
    domainState[userId] = { domain: message, zoneId, nameservers, ipAddress };
    await retryRequest(() => ctx.reply(`Домен ${message} добавлен в Cloudflare!\n\nДобавьте следующие NS-записи у регистратора:\n` + nameservers.map((ns, i) => `${i + 1}. ${ns}`).join('\n') + `\n\nA-записи настроены на IP: ${ipAddress}.\nПосле настройки NS нажмите "Проверить".`, { reply_markup: { inline_keyboard: [[{ text: 'Проверить', callback_data: `verify_domain_${message}` }]] } }));
  } catch (error) {
    const msg = (typeof error === 'object' && error !== null && error.message) ? error.message : String(error);
    if (msg.includes('1061') || msg.includes('already exists')) { await ctx.reply(`Домен ${message} уже есть в Cloudflare. Использовать его?`, { reply_markup: { inline_keyboard: [[{ text: 'Да', callback_data: `use_existing_zone_${message}_manual` }], [{ text: 'Нет, выбрать другой', callback_data: 'cancel_bind_domain' }] ] } }); return; }
    await retryRequest(() => ctx.reply(`Ошибка добавления домена ${message} в Cloudflare. ${msg.includes('already exists') ? 'Домен уже существует, удалите его или выберите другой.' : 'Проверьте IP сервера или API-токен.'}`, { reply_markup: { inline_keyboard: [[{ text: 'Отмена', callback_data: 'cancel_bind_domain' }]] } }));
  }
};
