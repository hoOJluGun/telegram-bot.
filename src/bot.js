const { Telegraf, Scenes, session } = require('telegraf');
const { loadHandlers } = require('./loader');

function setupBot() {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN не указан в .env');
    process.exit(1);
  }
  const bot = new Telegraf(BOT_TOKEN);
  const stage = new Scenes.Stage([]);

  bot.use(session());
  bot.use(stage.middleware());
  loadHandlers(bot);

  return bot;
}

module.exports = { setupBot };
