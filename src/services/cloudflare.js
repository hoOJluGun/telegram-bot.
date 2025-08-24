const Cloudflare = require("cloudflare");
function getCF(){ const t = process.env.CLOUDFLARE_API_TOKEN; if(!t) throw new Error("CLOUDFLARE_API_TOKEN отсутствует в .env"); return new Cloudflare({ token: t }); }
module.exports = { getCF };