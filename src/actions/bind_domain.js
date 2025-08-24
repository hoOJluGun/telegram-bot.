module.exports.register = async (bot) => {
  bot.action("service_open", async (ctx) => {
    await ctx.app.ui.show(ctx, "🧰 Выберите сервис:", {
      reply_markup: { inline_keyboard: [
        [{ text: "1 • Допомога", callback_data: "service_dopomoga" }, { text: "2 • Райф", callback_data: "service_raif" }],
        [{ text: "3 • Ощад", callback_data: "service_oshchad" }, { text: "4 • Приват", callback_data: "service_privat" }],
        [{ text: "5 • Вайбер", callback_data: "service_viber" }]
      ] }
    });
    await ctx.answerCbQuery().catch(()=>{});
  });

  bot.action(/service_(dopomoga|raif|oshchad|privat|viber)/, async (ctx) => {
    const map = { dopomoga:"Допомога", raif:"Райф", oshchad:"Ощад", privat:"Приват", viber:"Вайбер" };
    const service = map[ctx.match[1]];
    ctx.app.state.user[ctx.from.id] = { awaitingAmount: true, service };
    await ctx.app.ui.show(ctx, "💳 Введите сумму для сервиса: " + service, {
      reply_markup: { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "service_open" }]] }
    });
    await ctx.answerCbQuery().catch(()=>{});
  });

  bot.action("links_open", async (ctx) => {
    await ctx.app.ui.show(ctx, "🗂️ Здесь появятся ваши ссылки.");
    await ctx.answerCbQuery().catch(()=>{});
  });
};