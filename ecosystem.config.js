module.exports = {
  apps: [
    {
      name: 'telegram-bot__',
      script: './src/index.js',  // запускаем index.js в src
      cwd: '/Users/Ho_OJluGun/Desktop/telegram-bot__', // ВАЖНО!
      exec_mode: 'fork',
      instances: 1,              // только один инстанс
      watch: false,
      time: true,
      env: {
        NODE_ENV: 'production',
        // страховка, чтобы при split или require('bot') он не автозапускался
        DISABLE_BOT_LAUNCH: '1'
      }
    }
  ]
};
