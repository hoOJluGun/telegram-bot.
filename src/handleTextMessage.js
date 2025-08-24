const { applications, saveApplications } = require('./storage');
const { domainState } = require('./state');
const { retryRequest } = require('./helpers');
const { ADMIN_CHAT_ID, CLOUDFLARE_ACCOUNT_ID } = require('./config');

function createHandleTextMessage(bot, cf) {
  return async function handleTextMessage(ctx) {
    const userId = ctx.from.id;
    const username = ctx.from.username || 'Нет имени';
    const firstName = ctx.from.first_name || '';
    const lastName = ctx.from.last_name || '';
    const message = ctx.message.text;

    console.log(`Получено сообщение от ${userId} (@${username}): ${message}`);

    if (domainState[userId]?.awaitingDomain) {
      const domain = message.trim().toLowerCase();
      // Регулярное выражение для поддержки .biz.ua и других двухуровневых доменов
      if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+$/.test(domain)) {
        await retryRequest(() =>
          ctx.reply('Некорректный домен. Введите домен в формате example.com или pburarai.biz.ua:', {
            reply_markup: { inline_keyboard: [[{ text: 'Отмена', callback_data: 'cancel_bind_domain' }]] },
          })
        );
        console.log(`Некорректный домен от ${userId}: ${domain}`);
        return;
      }

      // Проверка существования домена в applications.json
      if (applications.domains?.[domain]) {
        await retryRequest(() =>
          ctx.reply(`Домен ${domain} уже зарегистрирован пользователем @${applications.domains[domain].ownerUsername || 'Неизвестно'}.`)
        );
        console.log(`Домен ${domain} уже существует в applications.json, владелец: ${applications.domains[domain].ownerId}`);
        delete domainState[userId];
        return;
      }

      // Проверка существования домена в Cloudflare
      let zoneId;
      try {
        const zones = await cf.zones.list();
        const existingZone = zones.result.find(z => z.name === domain);
        if (existingZone) {
          zoneId = existingZone.id;
          await retryRequest(() =>
            ctx.reply(
              `Домен ${domain} уже существует в Cloudflare (zoneId: ${zoneId}).\n` +
              `Хотите использовать его?`, {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: 'Да', callback_data: `use_existing_zone_${domain}_${zoneId}` }],
                    [{ text: 'Нет, выбрать другой', callback_data: 'cancel_bind_domain' }],
                  ],
                },
              }
            )
          );
          domainState[userId] = { domain, zoneId, nameservers: existingZone.name_servers };
          return;
        }
      } catch (error) {
        console.error(`Ошибка проверки существования домена ${domain}:`, error.message);
      }

      // Создание новой зоны, если домен не существует
      try {
        const zone = await cf.zones.create({ name: domain, account: { id: CLOUDFLARE_ACCOUNT_ID } });
        zoneId = zone.result.id;
        const nameservers = zone.result.name_servers;

        // IP-адрес для A-записей (IP хостинга Beget)
        const ipAddress = '45.130.41.157'; // Укажите ваш IP хостинга здесь

        // Создание A-записей
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
        console.log(`A-записи для ${domain} добавлены: www, @, *`);

        domainState[userId] = { domain, zoneId, nameservers, ipAddress };
        await retryRequest(() =>
          ctx.reply(
            `Домен ${domain} добавлен в Cloudflare!\n\n` +
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
        console.log(`Домен ${domain} добавлен в Cloudflare, zoneId: ${zoneId}, NS: ${nameservers.join(', ')}`);
      } catch (error) {
        console.error(`Ошибка добавления домена ${domain} в Cloudflare:`, error.message, error.stack);

        // Если домен уже существует (код 1061), предложим использовать существующую зону
        const msg = (typeof error === 'object' && error !== null && error.message) ? error.message : String(error);
        if (msg.includes('1061') || msg.includes('already exists')) {
          await ctx.reply(
            `Домен ${domain} уже есть в Cloudflare. Использовать его?`,
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: 'Да', callback_data: `use_existing_zone_${domain}_manual` }],
                  [{ text: 'Нет, выбрать другой', callback_data: 'cancel_bind_domain' }],
                ],
              },
            }
          );
          return;
        }

        await retryRequest(() =>
          ctx.reply(
            `Ошибка добавления домена ${domain} в Cloudflare. ${msg.includes('already exists') ? 'Домен уже существует, удалите его в Cloudflare Dashboard или выберите другой.' : 'Проверьте IP сервера или API-токен.'}`,
            { reply_markup: { inline_keyboard: [[{ text: 'Отмена', callback_data: 'cancel_bind_domain' }]] } }
          )
        );
      }
      return;
    }

    if (applications[userId] && applications[userId].status !== 'rejected') {
      return ctx.reply('Вы уже подали заявку. Дождитесь решения.');
    }

    applications[userId] = {
      status: 'pending',
      username,
      firstName,
      lastName,
      message,
      timestamp: new Date().toISOString(),
      messageId: null,
      links: [],
    };

    if (!ADMIN_CHAT_ID) {
      console.error('ADMIN_CHAT_ID не указан в .env — некуда отправлять заявки');
      saveApplications();
      return ctx.reply('Заявка принята локально, но админ-чат не настроен. Свяжитесь с админом.');
    }

    try {
      const sentMessage = await retryRequest(() =>
        bot.telegram.sendMessage(
          ADMIN_CHAT_ID,
          `Новая заявка от @${username} (${firstName} ${lastName}):\n${message}`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: 'Добавить', callback_data: `approve_${userId}` },
                  { text: 'Отклонить', callback_data: `reject_${userId}` },
                ],
              ],
            },
          }
        )
      );
      applications[userId].messageId = sentMessage.message_id;
      console.log(
        `Заявка от ${userId} отправлена в админ-чат, messageId: ${sentMessage.message_id}, adminChatId: ${ADMIN_CHAT_ID}`
      );
      saveApplications();
      await ctx.reply('Ваша заявка отправлена на рассмотрение.');
    } catch (error) {
      console.error('Ошибка отправки в админ-чат:', error.message, error.stack);
      await ctx.reply('Ошибка отправки заявки. Попробуйте позже.');
    }
  };
}

module.exports = { createHandleTextMessage };
