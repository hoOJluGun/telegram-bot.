require("dotenv").config({ quiet: true });
const { launchBot, stopBot } = require("./bot");

(async () => {
  try {
    await launchBot();
    process.on("SIGINT", stopBot);
    process.on("SIGTERM", stopBot);
  } catch (err) {
    console.error("Ошибка запуска бота:", err);
    process.exit(1);
  }
})();