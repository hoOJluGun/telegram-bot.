require('dotenv').config({ quiet: true });
const { Telegraf } = require('telegraf');
const fs = require('fs');
const crypto = require('crypto');

// Инициализация бота
const bot = new Telegraf(process.env.BOT_TOKEN);

// Путь к файлу для заявок
const applicationsFile = 'applications.json';

// Загрузка или создание файла
let applications = {};
if (fs.existsSync(applicationsFile)) {
  try {
    applications = JSON.parse(fs.readFileSync(applicationsFile, 'utf8'));
  } catch (error) {
    console.error('Ошибка чтения applications.json:', error.message, error.stack);
    applications = {};
  }
}

// Временное хранилище состояния пользователей
const userState = {};

// Файл и список администраторов
const adminsFile = 'admins.json';
let admins = [];
if (fs.existsSync(adminsFile)) {
  try {
    admins = JSON.parse(fs.readFileSync(adminsFile, 'utf8'));
  } catch (error) {
    console.error('Ошибка чтения admins.json:', error.message, error.stack);
    admins = [];
  }
}
if (process.env.ADMIN_ID) {
  const mainAdmin = Number(process.env.ADMIN_ID);
  if (!admins.includes(mainAdmin)) {
    admins.push(mainAdmin);
  }
}
const saveAdmins = () => {
  try {
    fs.writeFileSync(adminsFile, JSON.stringify(admins, null, 2));
  } catch (error) {
    console.error('Ошибка сохранения admins.json:', error.message, error.stack);
  }
};

// Сохранение заявок в файл
const saveApplications = () => {
  try {
    fs.writeFileSync(applicationsFile, JSON.stringify(applications, null, 2));
    console.log('Заявки сохранены в applications.json');
  } catch (error) {
    console.error('Ошибка сохранения applications.json:', error.message, error.stack);
  }
};

// Реальные Telegram-ссылки для сервисов
const serviceLinks = {
  'Допомога': 'https://t.me/dopomoga_group',
  'Райф': 'https://t.me/raif_group',
  'Ощад': 'https://t.me/oshchad_group',
  'Приват': 'https://t.me/privat_group',
  'Вайбер': 'https://t.me/viber_group',
};

// Генерация ссылки
const generateLink = (service, amount) => {
  const baseUrl = serviceLinks[service] || 'https://t.me/fallback_group';
  const id = crypto.randomUUID();
  const url = `${baseUrl}?amount=${amount}&id=${id}`;
  if (!url.startsWith('https://t.me/')) {
    console.error(`Ошибка: некорректный URL для сервиса ${service}: ${url}`);
    return 'https://t.me/fallback_group';
  }
  console.log(`Сгенерирована ссылка: ${url}`);
  return url;
};

// Обработка текстового сообщения (для подачи заявки)
const handleTextMessage = async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username || 'Нет имени';
  const firstName = ctx.from.first_name || '';
  const lastName = ctx.from.last_name || '';
  const message = ctx.message.text;

  console.log(`Получено сообщение от ${userId} (@${username}): ${message}`);

  if (applications[userId] && applications[userId].status !== 'rejected') {
    return ctx.reply('Вы уже подали заявку. Дождитесь решения.');
  }

  applications[userId] = {
    status: 'pending',
    username,
    firstName,
    lastName,
    message,
    timestamp: new Date().toISOString(),
    messageId: null,
    links: [],
  };

  try {
    const sentMessage = await bot.telegram.sendMessage(
      process.env.ADMIN_CHAT_ID,
      `Новая заявка от @${username} (${firstName} ${lastName}):\n${message}`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Добавить', callback_data: `approve_${userId}` },
              { text: 'Отклонить', callback_data: `reject_${userId}` },
            ],
          ],
        },
      }
    );
    applications[userId].messageId = sentMessage.message_id;
    console.log(`Заявка от ${userId} отправлена в админ-чат, messageId: ${sentMessage.message_id}, adminChatId: ${process.env.ADMIN_CHAT_ID}`);
    saveApplications();
    await ctx.reply('Ваша заявка отправлена на рассмотрение.');
  } catch (error) {
    console.error('Ошибка отправки в админ-чат:', error.message, error.stack);
    await ctx.reply('Ошибка отправки заявки. Попробуйте позже.');
  }
};

// Тестовая команда для проверки прав бота
bot.command('test', async (ctx) => {
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;
  console.log(`Команда /test от ${userId}, chatId: ${chatId}`);
  try {
    await ctx.reply('Тест: бот работает!');
    const testMessage = await bot.telegram.sendMessage(
      process.env.ADMIN_CHAT_ID,
      `Тестовое сообщение от @${ctx.from.username || 'Админ'}`,
      {
        reply_markup: {
          inline_keyboard: [[{ text: 'Тестовая кнопка', callback_data: 'test_button' }]],
        },
      }
    );
    console.log(`Тестовое сообщение отправлено в админ-чат, messageId: ${testMessage.message_id}, adminChatId: ${process.env.ADMIN_CHAT_ID}`);
  } catch (error) {
    console.error('Ошибка команды /test:', error.message, error.stack);
    await ctx.reply('Ошибка при тестировании. Проверьте логи.');
  }
});

// Назначение администратора командой /macedon <id>
bot.command('macedon', (ctx) => {
  const callerId = ctx.from.id;
  if (!admins.includes(callerId)) {
    return ctx.reply('У вас нет прав.');
  }
  const parts = ctx.message.text.split(/\s+|=/).filter(Boolean);
  const targetId = Number(parts[1]);
  if (!targetId) {
    return ctx.reply('Укажите ID пользователя.');
  }
  if (!admins.includes(targetId)) {
    admins.push(targetId);
    saveAdmins();
  }
  ctx.reply(`Пользователь ${targetId} назначен администратором.`);
});

// Команда /admin с выбором действий
bot.command('admin', (ctx) => {
  const userId = ctx.from.id;
  if (!admins.includes(userId)) {
    return ctx.reply('У вас нет прав.');
  }
  return ctx.reply('Выберите действие:', {
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'Привязать домен', callback_data: 'bind_domain' },
          { text: 'Добавить админа', callback_data: 'add_admin' },
        ],
      ],
    },
  });
});

// Обработка callback-запросов
bot.on('callback_query', async (ctx) => {
  const userId = ctx.from.id;
  const callbackData = ctx.callbackQuery.data;
  const messageId = ctx.callbackQuery.message?.message_id;
  console.log(`Callback от ${userId}, callbackData: ${callbackData}, messageId: ${messageId}, chatId: ${ctx.chat.id}`);

  try {
    // Тестовая кнопка
    if (callbackData === 'test_button') {
      console.log(`Тестовая кнопка нажата пользователем ${userId}`);
      await ctx.answerCbQuery('Тестовая кнопка работает!');
      return;
    }

    // Админские действия
    if (callbackData === 'bind_domain') {
      if (!admins.includes(userId)) {
        await ctx.answerCbQuery('Нет прав.');
        return;
      }
      await ctx.reply('Привязка домена пока не реализована.');
      await ctx.answerCbQuery();
      return;
    }

    if (callbackData === 'add_admin') {
      if (!admins.includes(userId)) {
        await ctx.answerCbQuery('Нет прав.');
        return;
      }
      const userButtons = Object.entries(applications)
        .filter(([id, data]) => id !== 'admins' && data.username)
        .map(([id, data]) => [{ text: `@${data.username}`, callback_data: `assign_admin_${id}` }]);
      if (userButtons.length === 0) {
        await ctx.reply('Нет пользователей для назначения.');
      } else {
        await ctx.reply('Выберите пользователя для назначения администратором:', {
          reply_markup: { inline_keyboard: userButtons },
        });
      }
      await ctx.answerCbQuery();
      return;
    }

    if (callbackData.startsWith('assign_admin_')) {
      if (!admins.includes(userId)) {
        await ctx.answerCbQuery('Нет прав.');
        return;
      }
      const targetId = Number(callbackData.replace('assign_admin_', ''));
      if (!admins.includes(targetId)) {
        admins.push(targetId);
        saveAdmins();
      }
      const uname = applications[targetId]?.username ? `@${applications[targetId].username}` : targetId;
      await ctx.reply(`Пользователь ${uname} назначен администратором.`);
      await ctx.answerCbQuery('Администратор добавлен');
      return;
    }

    // Одобрение/отклонение заявки
    if (callbackData.startsWith('approve_') || callbackData.startsWith('reject_')) {
      const [action, targetUserId] = callbackData.split('_');
      const adminChatId = process.env.ADMIN_CHAT_ID;
      const adminUsername = ctx.from.username || 'Админ';

      console.log(`Обработка ${action} для userId: ${targetUserId}, adminChatId: ${adminChatId}, messageId: ${messageId}`);

      if (!adminChatId) {
        console.error('ADMIN_CHAT_ID не определён в .env');
        await ctx.answerCbQuery('Ошибка: ADMIN_CHAT_ID не настроен.');
        return;
      }

      if (!applications[targetUserId]) {
        console.log(`Заявка для ${targetUserId} не найдена в applications`);
        await ctx.answerCbQuery('Заявка не найдена.');
        return;
      }

      if (!applications[targetUserId].messageId) {
        console.log(`messageId для ${targetUserId} отсутствует в applications`);
        await ctx.answerCbQuery('Ошибка: сообщение заявки не найдено.');
        return;
      }

      const originalText = `Новая заявка от @${applications[targetUserId].username} (${applications[targetUserId].firstName} ${applications[targetUserId].lastName}):\n${applications[targetUserId].message}`;
      let buttonText;

      console.log(`Попытка выполнить ${action} для ${targetUserId}`);

      if (action === 'approve') {
        applications[targetUserId].status = 'approved';
        buttonText = `Одобрил - @${adminUsername}`;
        try {
          await bot.telegram.sendMessage(targetUserId, 'Ваша заявка одобрена!', {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: 'Воркеры', url: 'https://t.me/+neejzwlpAbo1MjZi' },
                  { text: 'Профиты', url: 'https://t.me/+o9Kpn9RDIMExOWNi' },
                ],
              ],
            },
          });
          console.log(`Заявка ${targetUserId} одобрена, уведомление отправлено`);
        } catch (error) {
          console.error(`Ошибка отправки уведомления ${targetUserId}:`, error.message, error.stack);
          await ctx.answerCbQuery('Ошибка отправки уведомления пользователю.');
          return;
        }
      } else if (action === 'reject') {
        applications[targetUserId].status = 'rejected';
        buttonText = `Не одобрил - @${adminUsername}`;
        try {
          await bot.telegram.sendMessage(targetUserId, 'Ваша заявка отклонена.');
          console.log(`Заявка ${targetUserId} отклонена, уведомление отправлено`);
        } catch (error) {
          console.error(`Ошибка отправки уведомления ${targetUserId}:`, error.message, error.stack);
          await ctx.answerCbQuery('Ошибка отправки уведомления пользователю.');
          return;
        }
      }

      try {
        await bot.telegram.editMessageText(
          adminChatId,
          applications[targetUserId].messageId,
          null,
          originalText,
          {
            reply_markup: {
              inline_keyboard: [[{ text: buttonText, callback_data: 'noop' }]],
            },
          }
        );
        console.log(`Сообщение в админ-чате обновлено для ${targetUserId}, messageId: ${applications[targetUserId].messageId}`);
        saveApplications();
        await ctx.answerCbQuery(`Заявка ${action === 'approve' ? 'одобрена' : 'отклонена'}.`);
      } catch (error) {
        console.error(`Ошибка редактирования сообщения в админ-чате для ${targetUserId}:`, error.message, error.stack);
        await ctx.answerCbQuery('Ошибка обновления сообщения в админ-чате.');
        return;
      }
      return;
    }

    // Удаление ссылки
    if (callbackData.startsWith('delete_link_')) {
      const linkIndex = parseInt(callbackData.replace('delete_link_', ''), 10);
      console.log(`Попытка удалить ссылку ${linkIndex} для ${userId}`);

      if (applications[userId] && applications[userId].links && applications[userId].links[linkIndex]) {
        applications[userId].links.splice(linkIndex, 1);
        saveApplications();
        await ctx.answerCbQuery('Ссылка удалена.');
        console.log(`Ссылка ${linkIndex} удалена для ${userId}`);

        const userLinks = applications[userId].links || [];
        if (userLinks.length === 0) {
          await ctx.reply('У вас пока нет созданных ссылок.', {
            reply_markup: {
              keyboard: [
                [{ text: 'Выбрать сервис' }, { text: 'Мои ссылки' }],
              ],
              resize_keyboard: true,
              one_time_keyboard: false,
            },
          });
        } else {
          let response = '📜 Ваши ссылки:\n\n';
          const inlineKeyboard = [];
          userLinks.forEach((link, index) => {
            const url = link.url && link.url !== 'undefined' ? link.url : 'URL отсутствует';
            response += `🔗 Ссылка ${index + 1}:\n` +
                        `👑 ${url}\n` +
                        `👾 Сервис: ${link.service || 'Неизвестно'} 🇺🇦\n` +
                        `💰 Сумма: ${link.amount || '0'}\n` +
                        `📅 Создано: ${new Date(link.timestamp || Date.now()).toLocaleString('ru-RU')}\n\n`;
            inlineKeyboard.push([
              { text: `Открыть ссылку ${index + 1}`, url: link.url && link.url !== 'undefined' ? link.url : 'https://t.me/fallback_group' },
              { text: `Удалить ссылку ${index + 1}`, callback_data: `delete_link_${index}` },
            ]);
          });
          await ctx.reply(response, {
            reply_markup: { inline_keyboard: inlineKeyboard },
          });
          await ctx.reply('Выберите действие', {
            reply_markup: {
              keyboard: [
                [{ text: 'Выбрать сервис' }, { text: 'Мои ссылки' }],
              ],
              resize_keyboard: true,
              one_time_keyboard: false,
            },
          });
          console.log(`Отправлен список ссылок для ${userId} с ${inlineKeyboard.length} кнопками`);
        }
      } else {
        console.log(`Ссылка ${linkIndex} не найдена для ${userId}`);
        await ctx.answerCbQuery('Ссылка не найдена.');
      }
      return;
    }

    // Выбор сервиса
    if (applications[userId] && applications[userId].status === 'approved') {
      let selectedService;

      if (callbackData === 'back_to_services') {
        showServices(ctx);
        delete userState[userId];
        await ctx.answerCbQuery();
        console.log(`Пользователь ${userId} вернулся к выбору сервиса`);
        return;
      }

      switch (callbackData) {
        case 'service_dopomoga':
          selectedService = 'Допомога';
          break;
        case 'service_raif':
          selectedService = 'Райф';
          break;
        case 'service_oshchad':
          selectedService = 'Ощад';
          break;
        case 'service_privat':
          selectedService = 'Приват';
          break;
        case 'service_viber':
          selectedService = 'Вайбер';
          break;
        default:
          selectedService = null;
      }

      if (selectedService) {
        userState[userId] = { awaitingAmount: true, service: selectedService };
        await ctx.reply('💰 Укажите сумму объявления', {
          reply_markup: {
            inline_keyboard: [[{ text: 'Назад', callback_data: 'back_to_services' }]],
          },
        });
        await ctx.answerCbQuery();
        console.log(`Пользователь ${userId} выбрал сервис: ${selectedService}`);
      } else {
        console.log(`Неизвестный сервис: ${callbackData}`);
        await ctx.reply('Неизвестный сервис.');
        await ctx.answerCbQuery();
      }
    } else {
      console.log(`Доступ к сервисам ограничен для ${userId}`);
      await ctx.reply('Доступ к сервисам ограничен. Дождитесь одобрения вашей заявки.');
      await ctx.answerCbQuery();
    }
  } catch (error) {
    console.error('Ошибка в обработке callback_query:', error.message, error.stack);
    await ctx.answerCbQuery('Произошла ошибка при обработке действия.');
  }
});

// Команда /start
bot.start((ctx) => {
  const userId = ctx.from.id;
  console.log(`Команда /start от ${userId}`);

  if (applications[userId] && applications[userId].status === 'approved') {
    ctx.reply('Добро пожаловать! Выберите действие:', {
      reply_markup: {
        keyboard: [
          [{ text: 'Выбрать сервис' }, { text: 'Мои ссылки' }],
        ],
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

// Показ списка сервисов
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

// Обработка текстовых сообщений
bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const messageText = ctx.message.text;

  console.log(`Текст от ${userId}: ${messageText}`);

  if (applications[userId] && applications[userId].status === 'approved' && messageText === 'Выбрать сервис') {
    showServices(ctx);
  } else if (applications[userId] && applications[userId].status === 'approved' && messageText === 'Мои ссылки') {
    const userLinks = applications[userId].links || [];
    console.log(`Показ ссылок для ${userId}:`, userLinks);

    if (userLinks.length === 0) {
      await ctx.reply('У вас пока нет созданных ссылок.', {
        reply_markup: {
          keyboard: [
            [{ text: 'Выбрать сервис' }, { text: 'Мои ссылки' }],
          ],
          resize_keyboard: true,
          one_time_keyboard: false,
        },
      });
    } else {
      let response = '📜 Ваши ссылки:\n\n';
      const inlineKeyboard = [];
      userLinks.forEach((link, index) => {
        const url = link.url && link.url !== 'undefined' ? link.url : 'URL отсутствует';
        response += `🔗 Ссылка ${index + 1}:\n` +
                    `👑 ${url}\n` +
                    `👾 Сервис: ${link.service || 'Неизвестно'} 🇺🇦\n` +
                    `💰 Сумма: ${link.amount || '0'}\n` +
                    `📅 Создано: ${new Date(link.timestamp || Date.now()).toLocaleString('ru-RU')}\n\n`;
        inlineKeyboard.push([
          { text: `Открыть ссылку ${index + 1}`, url: link.url && link.url !== 'undefined' ? link.url : 'https://t.me/fallback_group' },
          { text: `Удалить ссылку ${index + 1}`, callback_data: `delete_link_${index}` },
        ]);
      });
      await ctx.reply(response, {
        reply_markup: {
          inline_keyboard: inlineKeyboard,
        },
      });
      await ctx.reply('Выберите действие', {
        reply_markup: {
          keyboard: [
            [{ text: 'Выбрать сервис' }, { text: 'Мои ссылки' }],
          ],
          resize_keyboard: true,
          one_time_keyboard: false,
        },
      });
      console.log(`Отправлен список ссылок для ${userId} с ${inlineKeyboard.length} кнопками`);
    }
  } else if (applications[userId] && applications[userId].status === 'approved' && userState[userId]?.awaitingAmount) {
    const amount = parseFloat(messageText);
    if (isNaN(amount)) {
      await ctx.reply('Пожалуйста, введите корректную сумму (число).', {
        reply_markup: {
          inline_keyboard: [[{ text: 'Назад', callback_data: 'back_to_services' }]],
        },
      });
      console.log(`Некорректная сумма от ${userId}: ${messageText}`);
      return;
    }

    const selectedService = userState[userId].service;
    const url = generateLink(selectedService, amount);
    if (!applications[userId].links) {
      applications[userId].links = [];
    }
    applications[userId].links.push({
      service: selectedService,
      amount,
      url,
      timestamp: new Date().toISOString(),
    });
    saveApplications();

    await ctx.reply(
      `ℹ️ Информация о ссылке\n` +
      `👑 ${url}\n` +
      `👾 Сервис: ${selectedService} 🇺🇦\n` +
      `💰 Сумма: ${amount}`,
      {
        reply_markup: {
          keyboard: [
            [{ text: 'Выбрать сервис' }, { text: 'Мои ссылки' }],
          ],
          resize_keyboard: true,
          one_time_keyboard: false,
        },
      }
    );
    console.log(`Создана ссылка для ${userId}: ${url}`);
    delete userState[userId];
  } else if (!applications[userId] || applications[userId].status === 'rejected') {
    await handleTextMessage(ctx);
  } else {
    await ctx.reply('Ваша заявка уже на рассмотрении или вы уже одобрены.');
  }
});

// Запуск бота
bot.launch().then(() => {
  console.log('Бот запущен');
}).catch((error) => {
  console.error('Ошибка запуска бота:', error.message, error.stack);
});

// Graceful остановка
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));