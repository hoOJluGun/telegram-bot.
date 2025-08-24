require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const Cloudflare = require('cloudflare');

// =================================================================
// 1. КОНФИГУРАЦИЯ И ПЕРЕМЕННЫЕ
// =================================================================

const {
  BOT_TOKEN,
  ADMIN_CHAT_ID,
  CLOUDFLARE_API_TOKEN,
  CLOUDFLARE_ACCOUNT_ID,
  DEFAULT_IP = '45.130.41.157',
} = process.env;

if (!BOT_TOKEN || !CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID) {
  console.error('Ошибка: Не все обязательные переменные окружения заданы (BOT_TOKEN, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID).');
  process.exit(1);
}

// =================================================================
// 2. ХРАНИЛИЩЕ (Storage) и СОСТОЯНИЕ (State)
// =================================================================

const applicationsFile = path.join(__dirname, 'applications.json');
const stateFile = path.join(__dirname, 'state.json');

const readJsonSafe = (filePath, fallback = {}) => {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (e) {
    console.error(`Ошибка чтения файла ${filePath}:`, e);
  }
  return fallback;
};

const saveJsonSafe = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(`Ошибка сохранения файла ${filePath}:`, e);
  }
};

const applications = readJsonSafe(applicationsFile);
const domainState = readJsonSafe(stateFile); // In-memory state for multi-step operations

const saveApplications = () => saveJsonSafe(applicationsFile, applications);
const saveState = () => saveJsonSafe(stateFile, domainState);

// =================================================================
// 3. ДЕМО-РЕЖИМ И АВТОРИЗАЦИЯ
// =================================================================

const hasAdmins = Object.values(applications).some(user => user.admin === true);
const DEMO_MODE = !hasAdmins;

function isUserAdmin(userId) {
  return DEMO_MODE || applications[userId]?.admin === true;
}

const requireAdmin = (ctx, next) => {
  if (isUserAdmin(ctx.from.id)) {
    return next();
  }
  return ctx.reply('⛔️ У вас нет доступа к этой функции.');
};

// =================================================================
// 4. СЕРВИСЫ (Cloudflare)
// =================================================================

const cf = new Cloudflare({ token: CLOUDFLARE_API_TOKEN });

const findZoneByName = async (domain) => {
  const { result } = await cf.zones.list({ name: domain });
  return result[0];
};

const createZone = async (domain) => {
  const { result } = await cf.zones.create({ name: domain, account: { id: CLOUDFLARE_ACCOUNT_ID } });
  return result;
};

const readZone = async (zoneId) => {
    const { result } = await cf.zones.read(zoneId);
    return result;
};

const listDns = async (zoneId) => {
    const { result } = await cf.dnsRecords.list({ zone_id: zoneId });
    return result;
};

const addARecord = async (zoneId, name, content, proxied = true) => {
  await cf.dnsRecords.create(zoneId, { type: 'A', name, content, proxied, ttl: 3600 });
};

// =================================================================
// 5. ЛОГИКА БОТА (Handlers)
// =================================================================

const bot = new Telegraf(BOT_TOKEN);

// --- Команды ---

bot.command('start', async (ctx) => {
  const userId = ctx.from.id;

  if (!applications[userId]) {
    applications[userId] = {
      id: userId,
      status: 'new',
      username: ctx.from.username || 'Нет имени',
      firstName: ctx.from.first_name || '',
      lastName: ctx.from.last_name || '',
      timestamp: new Date().toISOString(),
      admin: false,
    };
    saveApplications();
  }

  if (DEMO_MODE) {
    await ctx.reply(
      '👋 Добро пожаловать!\n\n' +
      '🤖 Бот работает в **демо-режиме**, так как не назначен ни один администратор. ' +
      'Вам доступны все функции. Чтобы выйти из демо-режима, назначьте администратора командой `/macedon <ID пользователя>`.',
      { parse_mode: 'Markdown' }
    );
  }

  let keyboard;
  let message = 'Добро пожаловать!';

  if (isUserAdmin(userId)) {
    message = 'Панель администратора:';
    keyboard = [['Мои домены', 'Добавить домен'], ['Генератор ссылок', 'Управление']];
  } else if (applications[userId]?.status === 'approved') {
    keyboard = [['Мои домены', 'Добавить домен'], ['Генератор ссылок']];
  } else if (applications[userId]?.status === 'pending') {
    message = '⏳ Ваша заявка на рассмотрении. Пожалуйста, ожидайте.';
  } else {
    message = 'Добро пожаловать! Чтобы получить доступ к функциям, подайте заявку, нажав на кнопку ниже.';
    keyboard = [['Подать заявку']];
  }

  return ctx.reply(message, keyboard ? Markup.keyboard(keyboard).resize() : undefined);
});

bot.command('macedon', (ctx) => {
  if (!DEMO_MODE && !isUserAdmin(ctx.from.id)) {
    return ctx.reply('⛔️ У вас нет доступа к этой команде.');
  }

  const parts = ctx.message.text.split(/\s+/);
  const targetId = Number(parts[1]);

  if (!targetId || isNaN(targetId)) {
    return ctx.reply('Укажите корректный ID пользователя. Пример: /macedon 123456789');
  }
  if (!applications[targetId]) {
    return ctx.reply(`Пользователь с ID ${targetId} не найден. Он должен сначала запустить бота (/start).`);
  }
  if (applications[targetId].admin === true) {
    return ctx.reply(`Пользователь ${targetId} уже является администратором.`);
  }

  applications[targetId].admin = true;
  saveApplications();
  ctx.reply(`Пользователь ${targetId} назначен администратором. Бот перезапустится для применения изменений.`);
});

// Создадим функцию для админ-панели, чтобы ее можно было использовать повторно
const showAdminPanel = async (ctx) => {
  await ctx.reply('Панель администратора:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Список пользователей', callback_data: 'admin_list_users' }],
        [{ text: 'Назначить админа', callback_data: 'admin_manage_admins' }],
      ],
    },
  });
};

bot.command('admin', (ctx) => requireAdmin(ctx, () => showAdminPanel(ctx)));

// --- Обработчики кнопок (Hears) ---

bot.hears('Добавить домен', async (ctx) => {
  const userId = ctx.from.id;
  if (!isUserAdmin(userId) && applications[userId]?.status !== 'approved') {
    return ctx.reply('⛔️ У вас нет доступа к этой функции.');
  }
  domainState[userId] = { awaitingDomain: true };
  saveState();
  await ctx.reply('Введите домен, который хотите привязать (например, example.com):', {
    reply_markup: { inline_keyboard: [[{ text: 'Отмена', callback_data: 'cancel_bind_domain' }]] },
  });
});

bot.hears('Мои домены', async (ctx) => {
  const userId = String(ctx.from.id);
  if (!isUserAdmin(ctx.from.id) && applications[userId]?.status !== 'approved') {
    return ctx.reply('⛔️ У вас нет доступа к этой функции.');
  }

  const userDomains = Object.entries(applications.domains || {})
    .filter(([, data]) => data.ownerId === userId)
    .map(([domain, data]) => `• \`${domain}\` (${data.verified ? '✅ активен' : '⏳ ожидает проверки'})`);

  if (userDomains.length === 0) {
    return ctx.reply('У вас пока нет добавленных доменов. Нажмите "Добавить домен", чтобы начать.');
  }
  return ctx.replyWithMarkdown(`Ваши домены:\n${userDomains.join('\n')}`);
});

bot.hears('Подать заявку', async (ctx) => {
  const userId = ctx.from.id;
  if (applications[userId]?.status === 'pending' || applications[userId]?.status === 'approved') {
    return ctx.reply('Вы уже подали заявку. Ожидайте решения или вы уже одобрены.');
  }
  return ctx.reply('Пожалуйста, расскажите немного о себе, чтобы администратор мог рассмотреть вашу заявку.');
});

bot.hears('Генератор ссылок', async (ctx) => {
  const userId = ctx.from.id;
  if (!isUserAdmin(userId) && applications[userId]?.status !== 'approved') {
    return ctx.reply('⛔️ У вас нет доступа к этой функции.');
  }
  return ctx.reply('Раздел "Генератор ссылок" находится в разработке.');
});

bot.hears('Управление', (ctx) => requireAdmin(ctx, () => showAdminPanel(ctx)));

// --- Обработчики встроенных кнопок (Actions) ---

bot.action(/^approve_(\d+)$/, (ctx) => requireAdmin(ctx, async () => {
    const targetId = ctx.match[1];
    if (applications[targetId]) {
        applications[targetId].status = 'approved';
        saveApplications();
        await ctx.telegram.sendMessage(targetId, '✅ Ваша заявка одобрена! Теперь вам доступны все функции бота.');
        await ctx.editMessageText(`✅ Заявка от @${applications[targetId].username} одобрена.`);
    } else {
        await ctx.answerCbQuery('Пользователь не найден.');
    }
}));

bot.action(/^reject_(\d+)$/, (ctx) => requireAdmin(ctx, async () => {
    const targetId = ctx.match[1];
    if (applications[targetId]) {
        applications[targetId].status = 'rejected';
        saveApplications();
        await ctx.telegram.sendMessage(targetId, '❌ Ваша заявка отклонена.');
        await ctx.editMessageText(`❌ Заявка от @${applications[targetId].username} отклонена.`);
    } else {
        await ctx.answerCbQuery('Пользователь не найден.');
    }
}));

bot.action('cancel_bind_domain', async (ctx) => {
  delete domainState[ctx.from.id];
  saveState();
  await ctx.editMessageText('Действие отменено.');
});

bot.action(/^verify_domain_(.+)$/, async (ctx) => {
  const userId = ctx.from.id;
  const domain = ctx.match[1];

  if (!isUserAdmin(userId) || !domainState[userId]?.zoneId) {
    return ctx.answerCbQuery('Ошибка: некорректный запрос.');
  }

  const { zoneId, nameservers } = domainState[userId];
  try {
    const zone = await readZone(zoneId);
    if (zone.status !== 'active') {
      return ctx.reply(
        `Домен ${domain} ещё не активен. Проверьте NS у регистратора:\n` +
        nameservers.map((ns, i) => `${i + 1}. ${ns}`).join('\n') +
        `\n\nПопробуйте снова через 5–10 минут.`,
        { reply_markup: { inline_keyboard: [[{ text: 'Проверить снова', callback_data: `verify_domain_${domain}` }]] } }
      );
    }

    applications.domains = applications.domains || {};
    applications.domains[domain] = { ownerId: String(userId), ownerUsername: ctx.from.username || 'Нет имени', addedAt: new Date().toISOString(), active: true, verified: true, nameservers };
    saveApplications();

    delete domainState[userId];
    saveState();

    await ctx.reply(`Домен ${domain} успешно привязан и готов к использованию!`);
    await ctx.answerCbQuery();
  } catch (e) {
    console.error(`[Cloudflare] Ошибка проверки домена ${domain} для пользователя ${userId}:`, e.message);
    await ctx.reply(`Ошибка при проверке домена ${domain}. Попробуйте позже.`);
  }
});

// --- Общий обработчик текста (должен быть последним) ---

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const message = ctx.message.text;

  // 1. Логика привязки домена (если пользователь в состоянии ожидания)
  if (domainState[userId]?.awaitingDomain) {
    const domain = message.trim().toLowerCase();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+$/.test(domain)) {
      return ctx.reply('Некорректный домен. Введите домен в формате example.com:');
    }

    try {
      const zone = await createZone(domain);
      await addARecord(zone.id, domain, DEFAULT_IP, true);
      await addARecord(zone.id, 'www', DEFAULT_IP, true);
      await addARecord(zone.id, '*', DEFAULT_IP, true);

      domainState[userId] = { domain, zoneId: zone.id, nameservers: zone.name_servers, ipAddress: DEFAULT_IP };
      saveState();

      return ctx.reply(
        `Домен ${domain} добавлен в Cloudflare!\n\n` +
        `Добавьте следующие NS-записи у вашего регистратора:\n` +
        zone.name_servers.map((ns, i) => `${i + 1}. ${ns}`).join('\n') +
        `\n\nПосле настройки NS-записей (может занять до 24 часов) нажмите "Проверить".`,
        { reply_markup: { inline_keyboard: [[{ text: 'Проверить', callback_data: `verify_domain_${domain}` }]] } }
      );
    } catch (error) {
      console.error(`[Cloudflare] Ошибка создания зоны для домена ${domain} для пользователя ${userId}:`, error.message);
      const msg = error.message || '';
      if (msg.includes("1061") || msg.includes("already exists")) {
        return ctx.reply(`Домен ${domain} уже существует в Cloudflare. Возможно, он принадлежит другому аккаунту.`);
      }
      return ctx.reply(`Ошибка добавления домена: ${error.message}`);
    }
  }

  // 2. Логика подачи заявки
  if (applications[userId]?.status === 'new' || applications[userId]?.status === 'rejected') {
    if (!ADMIN_CHAT_ID) {
      return ctx.reply('Извините, прием заявок временно невозможен. Админ-чат не настроен.');
    }

    applications[userId].status = 'pending';
    applications[userId].message = message;
    saveApplications();

    await ctx.telegram.sendMessage(
      ADMIN_CHAT_ID,
      `Новая заявка от @${applications[userId].username} (${userId}):\n${message}`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Добавить', callback_data: `approve_${userId}` }, { text: 'Отклонить', callback_data: `reject_${userId}` }],
          ],
        },
      }
    );
    return ctx.reply('Ваша заявка отправлена на рассмотрение.');
  }
});

// =================================================================
// 6. ЗАПУСК БОТА
// =================================================================

bot.catch((err, ctx) => {
  console.error(`Ошибка для ${ctx.updateType}`, err);
});

(async () => {
  try {
    if (DEMO_MODE) {
      console.warn('⚠️ ВНИМАНИЕ: Не найдено ни одного администратора. Бот запущен в ДЕМО-РЕЖИМЕ.');
    }
    await bot.launch();
    console.log('✅ Бот успешно запущен в едином файле!');
  } catch (err) {
    console.error('Критическая ошибка запуска:', err);
    process.exit(1);
  }
})();

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));