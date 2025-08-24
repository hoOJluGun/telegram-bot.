require('dotenv').config();
const { setupBot } = require('./bot');

(async () => {
  try {
    const bot = setupBot();
    await bot.launch();
    console.log('✅ Bot запущен');
  } catch (err) {
    console.error('Ошибка запуска:', err);
    process.exit(1);
  }
})();
