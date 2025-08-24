const callbackCache = new Map();
let lastText = '';

function addToCallbackCache(key) {
  const now = Date.now();
  if (callbackCache.has(key)) {
    const t = callbackCache.get(key);
    if (now - t < 5000) return false;
  }
  callbackCache.set(key, now);
  setTimeout(() => callbackCache.delete(key), 5000);
  return true;
}

async function retryRequest(fn, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try { return await fn(); } catch (e) {
      if (attempt === maxRetries) throw e;
      await new Promise(r => setTimeout(r, baseDelay * attempt));
    }
  }
}

async function editOrReply(ctx, text, options) {
  if (text === lastText) text += ' \u200B';
  lastText = text;
  try {
    if (ctx.update.callback_query?.message) {
      return await ctx.editMessageText(text, options);
    } else {
      return await ctx.reply(text, options);
    }
  } catch {
    return await ctx.reply(text, options);
  }
}

module.exports = { addToCallbackCache, retryRequest, editOrReply };
