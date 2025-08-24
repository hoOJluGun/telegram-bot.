function escapeMarkdownV2(text) {
  return String(text).replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

async function show(ctx, text, options = {}) {
  const { edit, parseMode = 'MarkdownV2', noEscape = false, replyMarkup } = options;
  const safeText = noEscape ? text : escapeMarkdownV2(text);

  if (edit) {
    return ctx.editMessageText(safeText, { parse_mode: parseMode, reply_markup: replyMarkup });
  }
  return ctx.reply(safeText, { parse_mode: parseMode, reply_markup: replyMarkup });
}

// Шаблонный тэг для безопасной подстановки переменных,
// когда ты ХОЧЕШЬ использовать MarkdownV2 разметку.
const md = (strings, ...values) =>
  strings.map((s, i) => s + (i < values.length ? escapeMarkdownV2(values[i]) : '')).join('');

module.exports = { show, escapeMarkdownV2, md };
