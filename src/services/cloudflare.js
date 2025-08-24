const Cloudflare = require('cloudflare');
const cf = new Cloudflare({ token: process.env.CLOUDFLARE_API_TOKEN });
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

async function ensureZone(domain) {
  const zones = await cf.zones.browse();
  let zone = zones.result.find(z => z.name === domain);
  if (!zone) {
    zone = (await cf.zones.add({ name: domain, account: { id: accountId }, jump_start: true })).result;
  }
  return zone;
}

async function addARecord(zoneId, name, ip) {
  await cf.dnsRecords.add(zoneId, { type: 'A', name, content: ip, ttl: 120 });
}

module.exports = { ensureZone, addARecord };
