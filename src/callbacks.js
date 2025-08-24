const crypto = require("crypto");
const { applications, saveApplications } = require('./storage');
const { userState, domainState } = require('./state');
const { isAdminId, addToCallbackCache, buildAdminKeyboard } = require('./admin');
const { retryRequest, logDnsRecords } = require('./helpers');
const { ADMIN_CHAT_ID } = require('./config');

function registerCallbacks(bot, cf) {
  bot.on('callback_query', async (ctx) => {
    const userId = ctx.from.id;
    const callbackData = ctx.callbackQuery.data;
    const messageId = ctx.callbackQuery.message?.message_id;
    const chatId = ctx.chat?.id;
    console.log(`Callback от ${userId}, callbackData: ${callbackData}, messageId: ${messageId}, chatId: ${chatId}`);

    try {
      if (callbackData === 'test_button') {
        console.log(`Тестовая кнопка нажата пользователем ${userId}`);
        await ctx.answerCbQuery('Тестовая кнопка работает!');
        return;
      }

      if (callbackData === 'noop') {
        await ctx.answerCbQuery();
        return;
      }

      if (callbackData === 'bind_domain') {
        if (!isAdminId(userId)) {
          await ctx.answerCbQuery('Нет прав.');
          return;
        }
        domainState[userId] = { awaitingDomain: true };
        await retryRequest(() =>
          ctx.reply('Введите домен (например, example.com или pburarai.biz.ua):', {
            reply_markup: {
              inline_keyboard: [[{ text: 'Отмена', callback_data: 'cancel_bind_domain' }]],
            },
          })
        );
        await ctx.answerCbQuery();
        return;
      }

      if (callbackData === 'cancel_bind_domain') {
        delete domainState[userId];
        await ctx.reply('Привязка домена отменена.');
        await ctx.answerCbQuery();
        return;
      }

      if (callbackData.startsWith('verify_domain_')) {
        const domain = callbackData.replace('verify_domain_', '');
        if (!isAdminId(userId) || !domainState[userId]?.zoneId) {
          await ctx.answerCbQuery('Ошибка: некорректный запрос.');
          return;
        }

        const { zoneId, nameservers } = domainState[userId];
        const ipAddress = domainState[userId]?.ipAddress || '45.130.41.157';
        console.log(`Проверка статуса зоны для ${domain}, zoneId: ${zoneId}`);

        try {
          const zone = await cf.zones.read(zoneId);
          if (zone.result.status !== 'active') {
            await retryRequest(() =>
              ctx.reply(`Домен ${domain} еще не активен в Cloudflare. Проверьте, что NS-записи настроены у ргистратора:\n` +
                nameservers.map((ns, i) => `${i + 1}. ${ns}`).join('\n') +
                `\n\nПопробуйте снова через 5-10 минут.`, {
                reply_markup: {
                  inline_keyboard: [[{ text: 'Проверить снова', callback_data: `verify_domain_${domain}` }]],
                },
              })
            );
            console.log(`Домен ${domain} не активен, статус: ${zone.result.status}`);
            return;
          }

          applications.domains = applications.domains || {};
          applications.domains[domain] = {
            ownerId: String(userId),
            ownerUsername: ctx.from.username || 'Нет имени',
            addedAt: new Date().toISOString(),
            active: true,
            verified: true,
            nameservers,
          };
          saveApplications();

          // Лог всех DNS-записей зоны
          await logDnsRecords(cf, zoneId, domain, ctx);

          await retryRequest(() =>
            ctx.reply(
              `Домен ${domain} успешно привязан!\n\n` +
              `A-записи настроены на IP: ${ipAddress}.\n` +
              `NS-записи:\n` +
              nameservers.map((ns, i) => `${i + 1}. ${ns}`).join('\n') +
              `\n\nДомен готов к использованию в ссылках.`
            )
          );
          console.log(`Домен ${domain} успешно привязан пользователем ${userId}`);
          delete domainState[userId];
          await ctx.answerCbQuery();
        } catch (error) {
          console.error(`Ошибка при привязке домена ${domain}:`, error.message);
          await retryRequest(() =>
            ctx.reply(`Ошибка при привязке домена ${domain}. Проверьте настройки DNS или API-токен.`, {
              reply_markup: {
                inline_keyboard: [[{ text: 'Проверить снова', callback_data: `verify_domain_${domain}` }]],
              },
            })
          );
        }
        return;
      }

      if (callbackData.startsWith('use_existing_zone_') && callbackData.endsWith('_manual')) {
        const domain = callbackData.replace('use_existing_zone_', '').replace('_manual','');
        if (!isAdminId(userId)) {
          await ctx.answerCbQuery('Нет прав.');
          return;
        }
        // Ищем зону по имени
        const zones = await cf.zones.list({ name: domain });
        if (!zones.result || !zones.result.length) {
          await ctx.reply(`⚠️ Не удалось найти зону для ${domain}`);
          return;
        }
        const zoneId = zones.result[0].id;
        const nameservers = zones.result[0].name_servers;
        domainState[userId] = { domain, zoneId, nameservers, ipAddress: '45.130.41.157' };

        const ipAddress = '45.130.41.157'; // IP хостинга Beget
        try {
          for (const name of ['@', 'www', '*']) {
            await cf.dnsRecords.create(zoneId, {
              type: 'A',
              name: name === '@' ? domain : `${name}.${domain}`,
              content: ipAddress,
              ttl: 3600,
              proxied: true,
            });
          }
          console.log(`A-записи для ${domain} добавлены в существующую зону (manual)`);
        } catch (error) {
          console.error(`Ошибка добавления A-записей (manual) для ${domain}:`, error.message);
        }

        await retryRequest(() =>
          ctx.reply(
            `Домен ${domain} привязан к существующей зоне!\n\n` +
            `Добавьте следующие NS-записи у вашего регистратора домена:\n` +
            nameservers.map((ns, i) => `${i + 1}. ${ns}`).join('\n') +
            `\n\nA-записи настроены на IP: ${ipAddress}.\n` +
            `После настройки NS-записей (может занять до 24 часов) нажмите "Проверить".`,
            { reply_markup: { inline_keyboard: [[{ text: 'Проверить', callback_data: `verify_domain_${domain}` }]] } }
          )
        );
        await ctx.answerCbQuery();
        return;
      }

      if (callbackData.startsWith('use_existing_zone_')) {
        const [domain, zoneId] = callbackData.replace('use_existing_zone_', '').split('_');
        if (!isAdminId(userId)) {
          await ctx.answerCbQuery('Нет прав.');
          return;
        }

        const nameservers = (await cf.zones.read(zoneId)).result.name_servers;
        domainState[userId] = { domain, zoneId, nameservers, ipAddress: '45.130.41.157' };

        // Проверка и настройка A-записей для существующей зоны
        const ipAddress = '45.130.41.157'; // IP хостинга Beget
        try {
          await cf.dnsRecords.create(zoneId, {
            type: 'A',
            name: 'www.' + domain,
            content: ipAddress,
            ttl: 3600,
            proxied: true,
          });
          await cf.dnsRecords.create(zoneId, {
            type: 'A',
            name: domain,
            content: ipAddress,
            ttl: 3600,
            proxied: true,
          });
          await cf.dnsRecords.create(zoneId, {
            type: 'A',
            name: '*.' + domain,
            content: ipAddress,
            ttl: 3600,
            proxied: true,
          });
          console.log(`A-записи для ${domain} добавлены в существующую зону`);
        } catch (error) {
          console.error(`Ошибка добавления A-записей для ${domain}:`, error.message);
        }

        await retryRequest(() =>
          ctx.reply(
            `Домен ${domain} привязан к существующей зоне!\n\n` +
            `Добавьте следующие NS-записи у вашего регистратора домена:\n` +
            nameservers.map((ns, i) => `${i + 1}. ${ns}`).join('\n') +
            `\n\nA-записи настроены на IP: ${ipAddress}.\n` +
            `После настройки NS-записей (может занять до 24 часов) нажмите "Проверить".`,
            {
              reply_markup: {
                inline_keyboard: [[{ text: 'Проверить', callback_data: `verify_domain_${domain}` }]],
              },
            }
          )
        );
        await ctx.answerCbQuery();
        return;
      }

      if (callbackData === 'manage_admins') {
        if (!isAdminId(userId)) {
          await ctx.answerCbQuery('Нет прав.');
          return;
        }
        const userButtons = buildAdminKeyboard();
        await retryRequest(() =>
          ctx.reply('Управление администраторами:', {
            reply_markup: { inline_keyboard: userButtons },
          })
        );
        await ctx.answerCbQuery();
        return;
      }

      if (callbackData.startsWith('toggle_admin_')) {
        if (!isAdminId(userId)) {
          await ctx.answerCbQuery('Нет прав.');
          return;
        }

        const targetId = Number(callbackData.replace('toggle_admin_', ''));
        if (!applications[targetId]) {
          await ctx.answerCbQuery('Пользователь не найден в заявках.');
          return;
        }

        const uniqueToken = crypto.randomBytes(8).toString('hex');
        const callbackKey = `${chatId}_${messageId}_${targetId}_${uniqueToken}`;
        console.log(`[toggle_admin] Обработка callback: ${callbackKey}`);
        if (!addToCallbackCache(callbackKey)) {
          console.log(`[toggle_admin] Дубликат отклонён: ${callbackKey}`);
          await ctx.answerCbQuery('Действие уже выполняется, подождите.');
          return;
        }

        const isCurrentlyAdmin = applications[targetId].admin === true;
        applications[targetId].admin = !isCurrentlyAdmin;
        saveApplications();

        const userButtons = buildAdminKeyboard();
        try {
          await retryRequest(() =>
            ctx.editMessageText('Управление администраторами:', {
              chat_id: chatId,
              message_id: messageId,
              reply_markup: { inline_keyboard: userButtons },
            })
          );
          console.log(`[toggle_admin] Клавиатура обновлена для ${targetId}, admin: ${applications[targetId].admin}`);
        } catch (error) {
          console.error(`[toggle_admin] Ошибка обновления сообщения для ${targetId}:`, error.message);
          await retryRequest(() =>
            ctx.reply('Управление администраторами:', {
              reply_markup: { inline_keyboard: userButtons },
            })
          );
          console.log(`[toggle_admin] Отправлено новое сообщение для ${targetId}`);
        }

        const uname = applications[targetId]?.username ? `@${applications[targetId].username}` : targetId;
        console.log(`[toggle_admin] Статус админа для ${uname} (${targetId}) изменён. Admin: ${applications[targetId].admin}, by ${userId}`);
        await ctx.answerCbQuery();
        return;
      }

      if (callbackData.startsWith('approve_') || callbackData.startsWith('reject_')) {
        if (!isAdminId(userId)) {
          await ctx.answerCbQuery('Нет прав.');
          return;
        }

        const [action, targetUserId] = callbackData.split('_');
        const adminChatId = ADMIN_CHAT_ID;
        const adminUsername = ctx.from.username || 'Админ';

        console.log(`Обработка ${action} для userId: ${targetUserId}, adminChatId: ${adminChatId}, messageId: ${messageId}`);

        if (!adminChatId) {
          console.error('ADMIN_CHAT_ID не указан в .env');
          await ctx.answerCbQuery('Ошибка: ADMIN_CHAT_ID не настроен.');
          return;
        }

        if (!applications[targetUserId]) {
          console.log(`Заявка для ${targetUserId} не найдена в applications`);
          await ctx.answerCbQuery('Заявка не найдена.');
          return;
        }

        if (!applications[targetUserId].messageId) {
          console.log(`messageId для ${targetUserId} отсутствует в applications`);
          await ctx.answerCbQuery('Ошибка: сообщение заявки не найдено.');
          return;
        }

        const originalText =
          `Новая заявка от @${applications[targetUserId].username} ` +
          `(${applications[targetUserId].firstName} ${applications[targetUserId].lastName}):\n` +
          `${applications[targetUserId].message}`;

        let buttonText;

        console.log(`Попытка выполнить ${action} для ${targetUserId}`);

        if (action === 'approve') {
          applications[targetUserId].status = 'approved';
          buttonText = `Одобрил - @${adminUsername}`;
          try {
            await retryRequest(() =>
              bot.telegram.sendMessage(Number(targetUserId), 'Ваша заявка одобрена!', {
                reply_markup: {
                  inline_keyboard: [
                    [
                      { text: 'Воркеры', url: 'https://t.me/+neejzwlpAbo1MjZi' },
                      { text: 'Профиты', url: 'https://t.me/+o9Kpn9RDIMExOWNi' },
                    ],
                  ],
                },
              })
            );
            console.log(`Заявка ${targetUserId} одобрена, уведомление отправлено`);
          } catch (error) {
            console.error(`Ошибка отправки уведомления ${targetUserId}:`, error.message, error.stack);
            await ctx.answerCbQuery('Ошибка отправки уведомления пользователю.');
            return;
          }
        } else if (action === 'reject') {
          applications[targetUserId].status = 'rejected';
          buttonText = `Отклонил - @${adminUsername}`;
          try {
            await retryRequest(() =>
              bot.telegram.sendMessage(Number(targetUserId), 'Ваша заявка отклонена.')
            );
            console.log(`Заявка ${targetUserId} отклонена, уведомление отправлено`);
          } catch (error) {
            console.error(`Ошибка отправки уведомления ${targetUserId}:`, error.message, error.stack);
            await ctx.answerCbQuery('Ошибка отправки уведомления пользователю.');
            return;
          }
        }

        try {
          await retryRequest(() =>
            bot.telegram.editMessageText(adminChatId, applications[targetUserId].messageId, undefined, originalText, {
              reply_markup: {
                inline_keyboard: [[{ text: buttonText, callback_data: 'noop' }]],
              },
            })
          );
          console.log(`Сообщение в админ-чате обновлено для ${targetUserId}, action: ${action}`);
        } catch (error) {
          console.error(`Ошибка обновления сообщения в админ-чате для ${targetUserId}:`, error.message, error.stack);
          await ctx.answerCbQuery('Ошибка обновления сообщения в админ-чате.');
        }

        saveApplications();
        await ctx.answerCbQuery();
        return;
      }

      if (callbackData.startsWith('service_')) {
        const serviceMap = {
          'service_dopomoga': 'Допомога',
          'service_raif': 'Райф',
          'service_oshchad': 'Ощад',
          'service_privat': 'Приват',
          'service_viber': 'Вайбер',
        };
        const serviceKey = callbackData;
        const service = serviceMap[serviceKey];

        if (!service) {
          console.error(`Неизвестный сервис: ${serviceKey}`);
          await ctx.answerCbQuery('Ошибка: сервис не найден.');
          return;
        }

        userState[userId] = { awaitingAmount: true, service };
        await retryRequest(() =>
          ctx.reply('Введите сумму:', {
            reply_markup: {
              inline_keyboard: [[{ text: 'Отмена', callback_data: 'cancel_amount' }]],
            },
          })
        );
        await ctx.answerCbQuery();
        return;
      }

      if (callbackData === 'cancel_amount') {
        delete userState[userId];
        await ctx.reply('Ввод суммы отменен.');
        await ctx.answerCbQuery();
        return;
      }

    } catch (error) {
      console.error(`Ошибка обработки callback ${callbackData}:`, error.message, error.stack);
      await ctx.answerCbQuery('Произошла ошибка. Попробуйте снова.');
    }
  });
}

module.exports = { registerCallbacks };
