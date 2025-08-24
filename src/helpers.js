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

async function logDnsRecords(cf, zoneId, domain, ctx) {
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

module.exports = {
  retryRequest,
  logDnsRecords,
};
