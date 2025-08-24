const { applications, saveApplications } = require('./storage');
const { showServices } = require('./services');
const { retryRequest } = require('./helpers');
const { requireAdmin } = require('./admin');
const { ADMIN_CHAT_ID } = require('./config');

function registerCommands(bot) {
  bot.start((ctx) => {
    const userId = ctx.from.id;
    console.log(`Команда /start от ${userId}`);

    if (applications[userId] && applications[userId].status === 'approved') {
      ctx.reply('Добро пожаловать! Выберите действие:', {
        reply_markup: {
          keyboard: [[{ text: 'Выбрать сервис' }, { text: 'Мои ссылки' }]],
          resize_keyboard: true,
          one_time_keyboard: false,
        },
      });
    } else if (applications[userId] && applications[userId].status === 'pending') {
      ctx.reply('Ваша заявка на рассмотрении. Дождитесь решения.');
    } else {
      ctx.reply('Расскажите о себе:');
    }
  });

  bot.command('test', async (ctx) => {
    const userId = ctx.from.id;
    const chatId = ctx.chat?.id;
    console.log(`Команда /test от ${userId}, chatId: ${chatId}`);

    try {
      await ctx.reply('Тест: бот работает!');

      if (!ADMIN_CHAT_ID) {
        return ctx.reply('ADMIN_CHAT_ID не указан в .env, пропускаю отправку в админ-чат.');
      }

      const testMessage = await retryRequest(() =>
        bot.telegram.sendMessage(
          ADMIN_CHAT_ID,
          `Тестовое сообщение от @${ctx.from.username || 'Админ'}`,
          { reply_markup: { inline_keyboard: [[{ text: 'Тестовая кнопка', callback_data: 'test_button' }]] } }
        )
      );
      console.log(`Тестовое сообщение отправлено в админ-чат, messageId: ${testMessage.message_id}, adminChatId: ${ADMIN_CHAT_ID}`);
    } catch (error) {
      console.error('Ошибка команды /test:', error.message, error.stack);
      await ctx.reply('Ошибка при тестировании. Проверьте логи.');
    }
  });

  bot.command('macedon', async (ctx) => {
    const userId = ctx.from.id;
    const parts = ctx.message.text.split(/\s+|=/).filter(Boolean);
    const targetId = Number(parts[1]);
    if (Number.isNaN(targetId)) {
      return ctx.reply('Укажите корректный ID пользователя. Пример: /macedon 123456789');
    }

    if (!applications[targetId]) {
      return ctx.reply(`Пользователь с ID ${targetId} не найден в заявках.`);
    }

    if (applications[targetId].admin === true) {
      return ctx.reply(`Пользователь ${applications[targetId]?.username ? `@${applications[targetId].username}` : targetId} уже администратор.`);
    }

    applications[targetId].admin = true;
    saveApplications();
    const uname = applications[targetId]?.username ? `@${applications[targetId].username}` : targetId;
    await ctx.reply(`Пользователь ${uname} (${targetId}) назначен администратором.`);
    console.log(`[macedon] Админ добавлен: ${targetId} (${uname}) by ${userId}`);
  });

  bot.command('admin', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    await retryRequest(() =>
      ctx.reply('Выберите действие:', {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Добавить домен', callback_data: 'bind_domain' },
              { text: 'Администраторы', callback_data: 'manage_admins' },
            ],
          ],
        },
      })
    );
  });

  bot.hears('Мои ссылки', async (ctx) => {
    const userId = ctx.from.id;
    if (!applications[userId] || applications[userId].status !== 'approved') {
      return ctx.reply('У вас нет одобренных заявок или ссылок.');
    }

    const links = applications[userId].links || [];
    if (!links.length) {
      return ctx.reply('У вас пока нет ссылок.');
    }

    const linksText = links
      .map((link, index) => `${index + 1}. ${link.service} - ${link.amount} - ${link.link} (${link.timestamp})`)
      .join('\n');
    await ctx.reply(`Ваши ссылки:\n${linksText}`);
  });

  bot.hears('Выбрать сервис', async (ctx) => {
    const userId = ctx.from.id;
    if (!applications[userId] || applications[userId].status !== 'approved') {
      return ctx.reply('Ваша заявка не одобрена. Отправьте заявку через /start.');
    }
    showServices(ctx);
  });
}

module.exports = { registerCommands };
