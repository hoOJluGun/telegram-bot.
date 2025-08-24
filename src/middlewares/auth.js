/**
 * AUTH middleware
 * - Кладём в ctx.state:
 *   - db (если пришёл из app)
 *   - user (если БД умеет getUser/getUserById)
 *   - roles: { admin, support, mentor, worker, vbiv }
 *   - isAdmin, isSupport, isMentor, isWorker, isVbiv, isVbiver
 *   - roleName (первая найденная по приоритету) или 'guest'
 *   - bootstrap (флаг режима начальной настройки из env)
 *   - hasRole(role), anyRole(...roles)
 *   - requireRole(role) — просто булев хелпер (без ответов пользователю)
 */

module.exports.register = (bot) => {
  bot.use(async (ctx, next) => {
    try {
      // --- источники db, чтобы везде было одинаково ---
      const db =
        ctx.app?.db ||
        ctx.db ||
        ctx.state?.db ||
        null;

      if (db) ctx.state.db = db;

      const uid = ctx.from?.id ? String(ctx.from.id) : null;

      // --- Попытка подтянуть профиль пользователя, если БД предоставляет метод ---
      let user = null;
      try {
        if (db && uid) {
          if (typeof db.getUser === 'function') {
            user = db.getUser(uid);
          } else if (typeof db.getUserById === 'function') {
            user = db.getUserById(uid);
          }
        }
      } catch (_) {
        // молча: auth не должен падать, даже если БД не готова
      }

      if (user) ctx.state.user = user;

      // --- безопасная проверка роли ---
      const hasDbRoleCheck = !!(db && typeof db.isRole === 'function' && uid);
      const role = (name) => hasDbRoleCheck ? !!db.isRole(uid, name) : false;

      const roles = {
        admin:   role('admin'),
        support: role('support'),
        mentor:  role('mentor'),
        worker:  role('worker'),
        vbiv:    role('vbiv'), // тот самый vbiver
      };

      ctx.state.roles = roles;

      // Удобные флаги-алиасы
      ctx.state.isAdmin   = roles.admin;
      ctx.state.isSupport = roles.support;
      ctx.state.isMentor  = roles.mentor;
      ctx.state.isWorker  = roles.worker;
      ctx.state.isVbiv    = roles.vbiv;
      ctx.state.isVbiver  = roles.vbiv; // альтернативное имя, как просил

      // Приоритетное имя роли (для быстрых проверок/логов)
      const order = ['admin', 'mentor', 'support', 'worker', 'vbiv'];
      const firstRole = order.find((r) => roles[r]) || 'guest';
      ctx.state.roleName = firstRole;

      // Статус заявки, если БД его хранит в user.application.status
      if (user && user.application && typeof user.application.status === 'string') {
        ctx.state.applicationStatus = user.application.status; // 'pending' | 'approved' | 'rejected'
      }

      // Флаг bootstrap из ENV (1/true включен)
      const bootstrap =
        String(process.env.BOOTSTRAP || process.env.BOOTSTRAP_MODE || '')
          .trim()
          .toLowerCase();
      ctx.state.bootstrap = (bootstrap === '1' || bootstrap === 'true' || bootstrap === 'on');

      // Хелперы
      ctx.hasRole = (r) => !!ctx.state.roles?.[r];
      ctx.anyRole = (...rs) => rs.some((r) => !!ctx.state.roles?.[r]);
      ctx.requireRole = (r) => !!ctx.state.roles?.[r]; // просто булев флаг, без ответов

      await next();
    } catch (e) {
      // важно логировать весь объект ошибки, чтобы увидеть ReferenceError и проч.
      console.error('auth middleware error:', e);
      // не бросаем дальше — auth не должен ронять пайплайн
    }
  });
};
