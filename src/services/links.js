const crypto = require('crypto');
const { applications } = require('../storage/applications');

const serviceLinks = {
  'Допомога': 'https://t.me/dopomoga_group',
  'Райф': 'https://t.me/raif_group',
  'Ощад': 'https://t.me/oshchad_group',
  'Приват': 'https://t.me/privat_group',
  'Вайбер': 'https://t.me/viber_group',
};

function generateLink(service, amount, userId) {
  const userDomain = Object.entries(applications.domains || {})
    .find(([_, data]) => data.ownerId === String(userId) && data.active && data.verified)?.[0];
  const baseUrl = userDomain ? `https://${userDomain}` : (serviceLinks[service] || 'https://t.me/fallback_group');
  const id = crypto.randomUUID();
  const url = `${baseUrl}?amount=${amount}&id=${id}`;
  if (!url.startsWith('https://')) return 'https://t.me/fallback_group';
  return url;
}
module.exports = { serviceLinks, generateLink };
