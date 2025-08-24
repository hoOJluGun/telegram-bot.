const fs = require('fs');
const path = require('path');

function autoLoad(bot, dir, method) {
  const folder = path.join(__dirname, dir);
  if (!fs.existsSync(folder)) return;
  fs.readdirSync(folder).forEach(file => {
    if (file.endsWith('.js')) {
      const handler = require(path.join(folder, file));
      if (typeof handler === 'function') {
        method(handler, file);
      } else if (handler.action && handler.handler) {
        method(handler, file);
      }
    }
  });
}

function loadHandlers(bot) {
  autoLoad(bot, 'commands', (fn, name) => bot.command(name.replace('.js', ''), fn));
  autoLoad(bot, 'actions', (mod) => { if (mod.action && mod.handler) bot.action(mod.action, mod.handler); });
  autoLoad(bot, 'hears', (mod) => {
    if (mod.hear && mod.handler) bot.hears(mod.hear, mod.handler);
    else if (typeof mod === 'function') bot.on('text', mod);
  });
}

module.exports = { loadHandlers };
