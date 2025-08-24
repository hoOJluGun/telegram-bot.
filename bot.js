const { Telegraf } = require('telegraf');
const Cloudflare = require('cloudflare');
const { BOT_TOKEN, CLOUDFLARE_API_TOKEN } = require('./src/config');
const { registerCommands } = require('./src/commands');
const { registerCallbacks } = require('./src/callbacks');
const { registerTextHandler } = require('./src/textHandler');
const { createHandleTextMessage } = require('./src/handleTextMessage');

const bot = new Telegraf(BOT_TOKEN);
const cf = new Cloudflare({ token: CLOUDFLARE_API_TOKEN });

const handleTextMessage = createHandleTextMessage(bot, cf);

registerCommands(bot);
registerCallbacks(bot, cf);
registerTextHandler(bot, handleTextMessage);

bot.launch().then(() => {
  console.log('Бот запущен');
}).catch((error) => {
  console.error('Ошибка запуска бота:', error.message, error.stack);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
