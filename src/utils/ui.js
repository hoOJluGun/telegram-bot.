function showServices(ctx) {
  ctx.reply('Выберите сервис:', {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '1 - Допомога', callback_data: 'service_dopomoga' },
          { text: '2 - Райф', callback_data: 'service_raif' },
        ],
        [
          { text: '3 - Ощад', callback_data: 'service_oshchad' },
          { text: '4 - Приват', callback_data: 'service_privat' },
        ],
        [{ text: '5 - Вайбер', callback_data: 'service_viber' }],
      ],
    },
  });
}
module.exports = { showServices };
