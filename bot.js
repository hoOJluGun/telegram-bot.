require('dotenv').config({ quiet: true });
const { Telegraf } = require('telegraf');
const Cloudflare = require('cloudflare');

require('./bot/storage');
const createTextHandler = require('./bot/text');
const registerCommands = require('./bot/commands');
const registerCallbacks = require('./bot/callbacks');
const registerHears = require('./bot/hears');

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
   Регистрация обработчиков
========================== */
const handleTextMessage = createTextHandler(bot, cf, ADMIN_CHAT_ID, CLOUDFLARE_ACCOUNT_ID);
registerCommands(bot, ADMIN_CHAT_ID);
registerCallbacks(bot, cf, ADMIN_CHAT_ID);
registerHears(bot, handleTextMessage);

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
