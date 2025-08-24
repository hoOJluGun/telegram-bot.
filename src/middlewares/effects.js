/**
 * effects middleware
 * Даёт удобные эффекты в ctx.effects:
 *  - typing(ms)      — печатает "набирает..." указанное время
 *  - progress(total, stepMs, onTick?) — шлёт прогресс-бар (редактирует одно сообщение)
 *  - stop()          — останавливает все эффекты (в т.ч. при ошибках)
 * Плюс ui-хелперы:
 *  - ui.escape(text) — экранирование MarkdownV2
 *  - ui.show(text, extra) — безопасный send/edit с экранированием
 */

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

function escapeMarkdownV2(text = "") {
  // Экранируем всё, что просит Telegram MarkdownV2
  // https://core.telegram.org/bots/api#markdownv2-style
  return String(text).replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

module.exports.register = (bot) => {
  bot.use(async (ctx, next) => {
    // локальное состояние эффектов, чтобы уметь их останавливать
    const running = new Set();

    // -- typing(ms)
    async function typing(ms = 1500) {
      if (!ctx.chat) return;
      const token = {};
      running.add(token);
      const started = Date.now();
      try {
        // раз в ~4.5с дергаем action, чтобы индикатор не погас
        while (running.has(token) && Date.now() - started < ms) {
          await ctx.telegram.sendChatAction(ctx.chat.id, 'typing').catch(() => {});
          await delay(1200);
        }
      } finally {
        running.delete(token);
      }
    }

    // -- progress(totalTicks, stepMs, onTick) — редактируем одно сообщение прогресс-баром
    // Возвращает объект с stop() и messageId
    async function progress(total = 10, stepMs = 500, onTick) {
      if (!ctx.chat) return { stop: () => {}, messageId: null };
      const token = {};
      running.add(token);

      // начальный текст
      let msg;
      try {
        msg = await ctx.reply('⏳ Прогресс: [..........] 0%');
      } catch (_) {
        // если не можем отправить — выходим тихо
        running.delete(token);
        return { stop: () => {}, messageId: null };
      }

      const messageId = msg.message_id;

      const bar = (i, total) => {
        const done = Math.max(0, Math.min(total, i));
        const left = total - done;
        return `[${'█'.repeat(done)}${'·'.repeat(left)}]`;
      };

      (async () => {
        try {
          for (let i = 1; i <= total && running.has(token); i++) {
            const pct = Math.round((i / total) * 100);
            const text = `⏳ Прогресс: ${bar(i, total)} ${pct}%`;
            try {
              await ctx.telegram.editMessageText(
                ctx.chat.id,
                messageId,
                null,
                text
              );
            } catch (_) { /* ignore edit errors */ }

            if (typeof onTick === 'function') {
              try { await onTick(i, total, { messageId }); } catch (_) {}
            }
            await delay(stepMs);
          }
          if (running.has(token)) {
            try {
              await ctx.telegram.editMessageText(
                ctx.chat.id,
                messageId,
                null,
                '✅ Готово'
              );
            } catch (_) {}
          }
        } finally {
          running.delete(token);
        }
      })();

      // ручная остановка
      return {
        messageId,
        stop: () => running.delete(token),
      };
    }

    // -- стоп всех активных эффектов
    function stopAll() {
      running.clear();
    }

    // --- ui helpers ---
    const ui = {
      escape: escapeMarkdownV2,

      /**
       * ui.show: безопасно отправить/отредактировать текст
       * options:
       *  - edit: { chatId, messageId } чтобы редактировать
       *  - parseMode: 'MarkdownV2' | 'HTML' (по умолчанию MarkdownV2 с экранированием)
       *  - noEscape: true — если текст уже экранирован/не нужен MarkdownV2
       *  - replyMarkup: инлайн-клавиатура
       */
      async show(text, options = {}) {
        const {
          edit,
          parseMode = 'MarkdownV2',
          noEscape = false,
          replyMarkup,
        } = options;

        const payloadText = (parseMode === 'MarkdownV2' && !noEscape)
          ? escapeMarkdownV2(text)
          : text;

        const extra = {};
        if (parseMode) extra.parse_mode = parseMode;
        if (replyMarkup) extra.reply_markup = replyMarkup;

        try {
          if (edit?.chatId && edit?.messageId) {
            return await ctx.telegram.editMessageText(
              edit.chatId,
              edit.messageId,
              null,
              payloadText,
              extra
            );
          }
          return await ctx.reply(payloadText, extra);
        } catch (e) {
          // типовые ошибки телеги не должны ронять пайплайн
          //  - "can't parse entities" => попробуем без parse_mode
          if ((e?.description || '').includes("can't parse entities")) {
            try {
              return edit?.chatId && edit?.messageId
                ? await ctx.telegram.editMessageText(edit.chatId, edit.messageId, null, text)
                : await ctx.reply(text);
            } catch (_) {}
          }
          //  - "message is not modified" — просто игнорируем
          if ((e?.description || '').includes('message is not modified')) return null;
          // остальное — логируем и молчим
          console.error('ui.show:', e.description || e.message || e);
          return null;
        }
      },
    };

    // Привязываем к контексту
    ctx.effects = { typing, progress, stop: stopAll };
    ctx.ui = ui;

    // идём дальше по middleware-цепочке
    try {
      await next();
    } finally {
      // на всякий случай гасим хвосты эффектов после хендлера
      stopAll();
    }
  });
};
