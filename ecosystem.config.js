// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'telegram-bot',
    script: './index.js',
    watch: true, // Автоматический перезапуск при изменении файлов
    ignore_watch: ["node_modules", "state.json", ".git"],
    env_production: {
      NODE_ENV: 'production'
    }
  }]
};
