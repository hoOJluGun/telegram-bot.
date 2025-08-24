/**
 * Подвязывает singleton-БД к ctx.app.db и апсертит пользователя при каждом апдейте.
 * Гарантирует ОДИН вызов next() за проход.
 */
const path = require('path');

let dbSingleton = null;
function getDb() {
  if (!dbSingleton) {
    // единый инстанс БД для всего процесса
    dbSingleton = require(path.join(__dirname, '..', 'utils', 'userdb'));
  }
  return dbSingleton;
}

module.exports.register = (bot) => {
  bot.use(async (ctx, next) => {
    try {
      const db = getDb();
      if (!ctx.app) ctx.app = {};
      ctx.app.db = db;

      // мягкий апсерт юзера (без лишней логики — только базовые поля)
      if (ctx.from && db.upsertFromTelegram) {
        await db.upsertFromTelegram(ctx.from); // не дублирует заявки, только карточку юзера
      }

      await next(); // ВАЖНО: вызывать ровно один раз
    } catch (e) {
      console.error('userdb middleware error:', e.message);
      // тут НЕ вызываем next повторно
    }
  });
};
