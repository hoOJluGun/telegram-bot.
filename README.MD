
#                                                              F.    A.    Q.

#    Бот для обработки заявок пользователей с возможностью одобрения/отклонения админами и генерации ссылок для   одобренных пользователей.

#                                                              ОСНОВА ПРОЭКТА:

#    NODEJS>TELEGRAF>MACOS

#    СТРУКТУРА

# ├telegram-bot__/
 * ├─ tools/                    #
 * │  ├─split.js                #
 * ├─ RADME.MD                  # 
 * ├─ .env.example              # FAQ.
 * ├─ .env                      # .gitignore
 * ├─ package.json              # Создается автоматом
 * ├─ ecosystem.config.js       # для pm2 (опционально)
 * ├─ src/                      #
 * ├─ index.js                  # входная точка (стартует бота)
 * ├─ bot.js                    # создает Telegraf, общие middlewares
 * ├─ loader.js                 # автоподгрузка модулей
 * ├─ middlewares/              #
 * │  ├─ session.js             #
 * │  ├─ logging.js             #
 * │  └─ auth.js                #
 * ├─ commands/                 #
 * │  ├─ start.js               #
 * │  ├─ help.js                #
 * │  └─ bindDomain.js          #
 * ├─ actions/                  # callback_query обработчики
 * │  ├─ bind_domain.js         #
 * │  └─ cancel_bind_domain.js  #
 * ├─ hears/                    #
 * │  └─ domain_input.js        # текстовые триггеры
 * ├─ scenes/                   #
 * │  └─ bindDomainScene.js     # wizard/scene шаги
 * ├─ keyboards/                #
 * │  └─ mainMenu.js            #
 * ├─ services/                 #
 * │  ├─ cloudflare.js          # клиенты/SDK
 * │  └─ logger.js              #
 * └─ utils/                    #
 *   └─ validateDomain.js       #

 #
 #   1.
 #
 #         Клонируйте репозиторий:
   git clone https://github.com/***/telegram-bot__.git
      cd telegram-bot
 #
 #   2.
 #
 #         Установите зависимост/библиотеки/фреймворки (package.json):
 #
 #         Установить "start":  
      {
  "node ./src/index.js"
      },
 #         Установить "dependencies":
      {
   "cloudflare": "^4.5.0",
   "dotenv": "^17.2.1",
   "pm2": "^6.0.8",
   "telegraf": "^4.16.3"
      }; 
 * 
 *        +
 * 
 *          npm init -y
 *          npm install
 #
 #   3.             
 # 
 #         Создайте файл .env с своими токенами/переменными как в примере .env.example.
 #
 #   4. 
 #
 #         PM2 - Запуск бота:
     pm2 start ./src/index.js --name telegram-bot --watch
     pm2 logs telegram-bot__
 #         ИЛИ:
     pm2 start ecosystem.config.js
     pm2 logs telegram-bot__

 #         ИЛИ

 #         ЕСЛИ ВИСИТ ПРОЦЕСС:
     whoami
     echo "HOME=$HOME"

 #          Полностью остановить и стереть ВСЕ процессы текущего пользователя

     pm2 stop all || true
     pm2 delete all || true
     pm2 save --force 
     pm2 kill || true

 #           Удалить дампы автозапуска у ТЕКУЩЕГО пользователя

     rm -f "$HOME/.pm2/dump.pm2" "$HOME/.pm2/dump.pm2.bak"

 #           Если когда-то запускали pm2 через sudo — повторить всё для root (ОЧЕНЬ ВАЖНО)

     sudo pm2 stop all || true
     sudo pm2 delete all || true
     sudo pm2 save --force || true
     sudo pm2 kill || true
     sudo rm -f /root/.pm2/dump.pm2 /root/.pm2/dump.pm2.bak
 
 #          Linux (systemd)
     
     pm2 unstartup || true
     sudo pm2 unstartup || true

 #          MacOS (launchd)
    
     pm2 unstartup launchd || true
     sudo pm2 unstartup launchd || true

 #           На всякий случай прибить все node/pm2 процессы, не управляемые pm2 (голые node)
     
     pkill -f "node .*bot\.js" 2>/dev/null || true
     pkill -f "node .*split-bot\.js" 2>/dev/null || true
     pkill -f "node .*telegraf" 2>/dev/null || true
     pkill -f "pm2" 2>/dev/null || true

 #           Проверить, не осталось ли «голых» процессов node
     pgrep -fal node || true
     pgrep -fal pm2 || true

 #           На всякий случай убрать старый вебхук Телеграма (если был)
 #           ВАЖНО: BOT_TOKEN должен быть в вашем .env окружении или экспортируйте его перед командой

     curl -s "https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook?drop_pending_updates=true"

 #           Проверка процессов, альтернативные команды, если прежняя не показала ничего

     ps -ef | grep -E "node(.*/)?(bot\.js|split-bot\.js)|pm2" | grep -v grep || true

 #           Остановить и удалить процессы PM2 текущего пользователя под Windows
     pm2 stop all 2>$null
     pm2 delete all 2>$null
     pm2 save --force 2>$null
     pm2 kill 2>$null
 #           Стереть дампы автозапуска текущего пользователя
     Remove-Item -Force "$env:USERPROFILE\.pm2\dump.pm2" -ErrorAction SilentlyContinue
     Remove-Item -Force "$env:USERPROFILE\.pm2\dump.pm2.bak" -ErrorAction SilentlyContinue
 #           Если ставили pm2 под админом/другим пользователем — повторить для него (запустить этот же блок под тем пользователем).
 #           Если устанавливали pm2 как Windows service (pm2-windows-service):
      pm2-service-uninstall  # если установлен такой сервис
 #           Отключить автозапуск pm2 в Windows
     pm2 unstartup 2>$null
     pm2 unstartup windows 2>$null
 #           Прибить любые «голые» процессы node/pm2
     taskkill /F /IM node.exe /T 2>$null
     taskkill /F /IM pm2.exe /T 2>$null
 #           Проверить, не осталось ли node-процессов
     Get-Process node -ErrorAction SilentlyContinue
     Get-Process pm2 -ErrorAction SilentlyContinue
 #           Удалить старый вебхук Telegram (если вдруг включали вебхуки)
 #           Требуется доступный BOT_TOKEN в окружении
     Invoke-RestMethod -Uri "https://api.telegram.org/bot$env:BOT_TOKEN/deleteWebhook?drop_pending_updates=true" -Method Get


 #    5.         

 #            Как писать модули:
 
 *    Каждый файл-модуль должен экспортировать только register(bot). Внутри — регистрируете всё, что относится к этому модулю: bot.command, bot.action, bot.hears, и т.д.
 *    Если нужен строгий порядок (например, один middleware должен идти раньше другого), префиксуйте имена файлов как в автозагрузчике loader.js -  сортирует файлы в стире cron.

 #   6.
 #            Советы по порядку и «граблям»:
 *     Middleware порядок важен. Сессия (session()) и сцены — до обработчиков.
 *     Ошибки не глотайте. В каждом модуле оборачивайте асинхронные операции в try/catch, а глобально используйте bot.catch.
 *     Отключайте long-running таймауты. Указан handlerTimeout: 30_000 — адаптируйте под себя.
 *     CommonJS vs ESM. Вы используете require, всё ок с указанными версиями пакетов.

 #   7.
 #           Быстрый коммит без гитхаб репозитория через терминал (macOS/Linu) которая создаст всю структуру и пустые файлов.
 * - Создаёт модульную структуру src/*
 * - Создаёт .env (если нет), package.json, ecosystem.config.js, logs/
 * - Ничего не трогает в node_modules/, package-lock.json
 * Usage:
   bash -c 'mkdir -p tools && cat > tools/split-bot.js << "EOF"
    node tools/split-bot.js
    node tools/split-bot.js --force   
 *          --force перезаписать каркасные файлы (кроме .env, ВНИМАНИЕ!!! несохраненые данные будут утеряны)