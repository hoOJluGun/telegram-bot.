module.exports = { action: 'test_button', handler: async (ctx) => { await ctx.answerCbQuery('Тестовая кнопка работает!'); } };
