module.exports.register = async (bot) => {
  bot.command("admin", async (ctx) => {
    const isAdmin = ctx.app.admin?.isAdminId(ctx.from?.id);
    if (!isAdmin) return ctx.reply("⛔ У вас нет прав.").catch(()=>{});
    await ctx.app.ui.show(ctx, "⚙️ Админ-панель", {
      reply_markup: { inline_keyboard: [
        [{ text: "📥 Заявки (pending)", callback_data: "admin_apps_pending" }],
        [{ text: "👑 Админы", callback_data: "admin_list_admins" }],
      ] }
    });
  });
};
