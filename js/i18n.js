// Russian and English strings. Elements with data-i18n / data-i18n-html /
// data-i18n-attr="attr:key;attr:key" are filled by apply().
const RU = {
  'brand.top': 'ТАЙНЫЙ', 'brand.bottom': 'СПИСОК',
  'phase.menu': 'ГОТОВ К ХАОСУ', 'phase.lobby': 'ЛОББИ', 'phase.countdown': 'ПРИГОТОВЬСЯ', 'phase.play': 'МАТЧ ИДЁТ', 'phase.ended': 'МАТЧ ЗАВЕРШЁН',
  'mode.solo': 'СОЛО · {n} ИГРОКОВ', 'mode.online': 'ОНЛАЙН · {h} ЧЕЛ. + {b} БОТ.', 'mode.onlineNoBots': 'ОНЛАЙН · {h} ИГРОКОВ',
  'aria.sound': 'Звук', 'aria.help': 'Правила игры', 'aria.camera': 'Обзор арены · R', 'aria.pause': 'Меню',
  'contract.eyebrow': 'ТОЛЬКО ДЛЯ ТВОИХ ГЛАЗ', 'contract.title': 'ТВОЯ ЦЕЛЬ', 'contract.classified': 'СЕКРЕТНО', 'contract.reward': 'НАГРАДА', 'contract.rewardValue': '+1 ЗАКАЗ',
  'contract.waiting': 'ЖДЁТ РАЗДАЧИ', 'contract.waitingDesc': 'Карточка откроется в начале матча', 'contract.none': 'НОВАЯ РАЗДАЧА', 'contract.noneDesc': 'Подожди возвращения участников',
  'contract.respawn': 'Возвращение через {n} сек.', 'contract.masked': 'Цель в маскировке — ищи её!',
  'scores.title': 'ГОНКА ЗАКАЗОВ', 'scores.foot': 'Побеждают заказы, а не выживание', 'scores.bot': 'бот',
  'timer.label': 'ДО КОНЦА МАТЧА', 'location.arena': 'АРЕНА 01', 'location.name': 'Неоновая крыша',
  'minimap.you': 'ТЫ', 'minimap.target': 'ЦЕЛЬ',
  'ctl.move': 'движение', 'ctl.push': 'толчок', 'ctl.trap': 'ловушка', 'ctl.dash': 'рывок', 'ctl.mask': 'маска', 'ctl.camera': 'вращать · колесо — масштаб · R — обзор', 'ctl.mouse': 'МЫШЬ',
  'ability.push': 'ТОЛЧОК', 'ability.trap': 'ЛОВУШКА', 'ability.mask': 'МАСКИРОВКА', 'ability.dash': 'РЫВОК',
  'ability.pushKey': 'SPACE', 'ability.trapKey': 'E · РЯДОМ С ПЛИТОЙ', 'ability.maskKey': 'Q · 10 СЕКУНД', 'ability.dashKey': 'SHIFT',
  'ability.pushPad': 'Ⓐ', 'ability.trapPad': 'Ⓧ · РЯДОМ С ПЛИТОЙ', 'ability.maskPad': 'Ⓨ · 10 СЕКУНД', 'ability.dashPad': 'Ⓑ / RB',
  'ability.seconds': '{n} С',
  'trap.pulse': 'Импульс', 'trap.spring': 'Пружина', 'trap.cage': 'Клетка', 'trap.ice': 'Лёд',
  'trapEffect.pulse': 'выбывание', 'trapEffect.spring': 'катапульта', 'trapEffect.cage': 'задержание', 'trapEffect.ice': 'скольжение',
  'near.key': 'E', 'near.pad': 'Ⓧ',
  'mask.status': 'МАСКИРОВКА · {n} С', 'mask.you': '▼ ТЫ · МАСКА', 'label.you': '▼ ТЫ',
  'order.kicker': 'ТОЧНО В ЦЕЛЬ!', 'order.title': 'ЗАКАЗ ВЫПОЛНЕН', 'order.next': 'Новая цель: {name}', 'order.nextNone': 'Новая цель: ожидается',
  'countdown.go': 'ОХОТА!',
  'toast.start': 'Твоя цель — {name}. Удачной охоты!', 'toast.order': '+1 ЗАКАЗ! Новая карточка в кармане', 'toast.targetLost': 'Цель выбыла. Получена новая карточка',
  'toast.newTarget': 'Новая цель: {name}',
  'toast.eliminated': 'Тебя раскрыли! Возвращение через 5 секунд', 'toast.respawn': 'Ты снова в игре! Защита на 2 секунды', 'toast.noTrap': 'Подойди к жёлтой плите-ловушке',
  'toast.trapArmed': '{trap}: взведена. Уходи с плиты!', 'toast.mask': 'Облик: {name}. Боты потеряли твой след', 'toast.maskOnline': 'Облик: {name}. Тебя не узнать',
  'toast.unmask': 'Маскировка раскрыта!', 'toast.slip': 'Скользко! Уводи от края', 'toast.caught': 'Пойман! Клетка выведет тебя через 2 секунды', 'toast.turned': 'Это был твой охотник! Одной угрозой меньше',
  'toast.overview': 'Обзор всей крыши', 'toast.follow': 'Камера следует за тобой', 'toast.joined': '{name} присоединяется', 'toast.left': '{name} выходит — его место занимает бот',
  'toast.leftLobby': '{name} покидает лобби', 'toast.spectate': 'Матч уже идёт — ты в режиме наблюдателя до следующего раунда',
  'feed.order': '<b>{a}</b> выполнил заказ · {why}', 'feed.out': '{v} выбывает · {why}',
  'why.edge': 'за край', 'why.trap': 'ловушка', 'why.spring': 'пружина', 'why.cage': 'клетка',
  'menu.kicker': 'ЖИВЫЕ ГЕРОИ / BIG EYES', 'menu.title': 'НОЧЬ. <br>КРЫША. <br><em>ТВОЯ ЦЕЛЬ.</em>',
  'menu.body': 'В кармане — имя. На крыше — твоя цель.<br>Выполни больше тайных заказов, чем остальные.',
  'menu.solo': 'ИГРАТЬ С БОТАМИ', 'menu.online': 'ИГРАТЬ С ДРУЗЬЯМИ', 'menu.settings': 'НАСТРОЙКИ', 'menu.rules': 'ПРАВИЛА', 'menu.quit': 'ВЫХОД',
  'menu.hero': 'ТВОЙ ГЕРОЙ', 'menu.note': 'Три минуты хаоса · до 8 игроков · без последнего выжившего',
  'online.title': 'ИГРА С <em>ДРУЗЬЯМИ</em>', 'online.kicker': 'ДО 8 ИГРОКОВ · СВОБОДНЫЕ МЕСТА ЗАНИМАЮТ БОТЫ',
  'online.steam': 'STEAM', 'online.steamCreate': 'СОЗДАТЬ ЛОББИ STEAM', 'online.steamHint': 'Друзья заходят по приглашению или через «Присоединиться к игре» в списке друзей Steam.',
  'online.steamOff': 'Steam не запущен — лобби Steam недоступны. Играйте по локальной сети или по IP.', 'online.steamOn': 'Ты в Steam как {name}',
  'online.lan': 'ЛОКАЛЬНАЯ СЕТЬ / IP', 'online.lanCreate': 'СОЗДАТЬ ИГРУ', 'online.lanHint': 'Друзья подключаются по адресу, который появится в лобби. Для игры через интернет хосту нужен проброс порта {port}.',
  'online.join': 'ПОДКЛЮЧИТЬСЯ', 'online.address': 'IP-адрес хоста', 'online.addressPh': '192.168.1.20', 'online.code': 'Код комнаты', 'online.codePh': 'ABCD',
  'online.webCreate': 'СОЗДАТЬ КОМНАТУ', 'online.webHint': 'Комната на этом сервере. Друзья открывают эту же страницу и вводят код.',
  'online.name': 'Твоё имя', 'online.back': 'НАЗАД', 'online.connecting': 'Подключение…',
  'online.unavailable': 'Сетевая игра сейчас недоступна. Проверь подключение к интернету и попробуй позже.', 'online.friends': 'С ДРУЗЬЯМИ ПО ИНТЕРНЕТУ', 'online.pfHint': 'Создай комнату и скажи друзьям код из лобби — они вводят его у себя в игре. Подключение идёт напрямую между игроками.', 'online.busy': 'Подключаемся…', 'msg.p2pFail': 'Не удалось связаться с комнатой. Возможно, хост вышел или сеть блокирует прямое подключение — попробуйте, чтобы комнату создал другой игрок.',
  'demo.badge': 'ДЕМО-ВЕРСИЯ', 'demo.banner': 'Один матч с ботами в день. Вся игра и сеть — в Microsoft Store.', 'demo.get': 'ПОЛНАЯ ВЕРСИЯ', 'demo.limitTitle': 'ДЕМО <em>НА СЕГОДНЯ ВСЁ</em>', 'demo.limitBody': 'В демо-версии — один матч с ботами в день. В полной версии из Microsoft Store матчи без ограничений, выбор длительности и игра с друзьями по сети.', 'demo.onlineTitle': 'ИГРА С <em>ДРУЗЬЯМИ</em>', 'demo.onlineBody': 'Сетевая игра есть в полной версии из Microsoft Store. В демо можно сыграть один матч с ботами в день.', 'demo.store': 'ОТКРЫТЬ MICROSOFT STORE', 'demo.later': 'ПОЗЖЕ',
  'lobby.title': 'ЛОББИ', 'lobby.steamSub': 'Лобби Steam · только для друзей', 'lobby.lanSub': 'Адрес для друзей: {addr}', 'lobby.codeSub': 'Код комнаты: {code}',
  'lobby.players': 'ИГРОКИ', 'lobby.empty': 'Свободно', 'lobby.bot': 'Бот', 'lobby.host': 'хост', 'lobby.you': 'ты',
  'lobby.hero': 'ВЫБЕРИ ГЕРОЯ', 'lobby.settings': 'НАСТРОЙКИ МАТЧА', 'lobby.duration': 'Длительность', 'lobby.minutes': '{n} мин', 'lobby.bots': 'Боты на свободных местах',
  'lobby.invite': 'ПРИГЛАСИТЬ ДРУЗЕЙ', 'lobby.start': 'НАЧАТЬ МАТЧ', 'lobby.waitHost': 'ЖДЁМ ХОСТА…', 'lobby.leave': 'ПОКИНУТЬ', 'lobby.needPlayers': 'Нужен хотя бы ещё один игрок или боты',
  'lobby.copy': 'Копировать', 'lobby.copied': 'Скопировано', 'lobby.inMatch': 'Матч идёт', 'lobby.ping': '{n} мс',
  'settings.title': 'НАСТРОЙКИ', 'settings.language': 'Язык', 'settings.volume': 'Общая громкость', 'settings.music': 'Музыка', 'settings.sfx': 'Эффекты',
  'settings.quality': 'Качество графики', 'settings.q.low': 'Низкое', 'settings.q.medium': 'Среднее', 'settings.q.high': 'Высокое', 'settings.q.ultra': 'Ультра',
  'settings.dynamic': 'Динамическое разрешение', 'settings.fullscreen': 'Полноэкранный режим', 'settings.fps': 'Показывать FPS', 'settings.privacy': 'Конфиденциальность', 'settings.privacyOpen': 'ОТКРЫТЬ', 'settings.shake': 'Тряска камеры',
  'settings.tv': 'Крупный интерфейс (ТВ)',
  'demo.bannerXbox': 'Один матч с ботами в день. Полная версия с игрой по сети — в Microsoft Store для ПК с Windows.',
  'xbox.hint': 'Чтобы играть геймпадом, <b>зажми кнопку ☰</b> и выбери игровое управление <b>(Use game controls)</b>. Весь экран — <b>зажми ⧉</b>.',
  'xbox.rules': '<div class="keys"><h3>Xbox · Microsoft Edge</h3><p>Зажми <b>☰</b> и выбери игровое управление (Use game controls) — тогда геймпад управляет игрой, а не курсором. Зажми <b>☰</b> ещё раз, чтобы вернуть курсор. Зажми <b>⧉</b> — весь экран. Ⓑ — назад.</p></div>',
  'settings.back': 'ГОТОВО', 'settings.on': 'Вкл', 'settings.off': 'Выкл', 'settings.name': 'Имя в сетевой игре',
  'pause.kicker': 'ВЫДОХНИ. ТВОЯ ЦЕЛЬ ПОДОЖДЁТ.', 'pause.title': 'ИГРА <em>НА ПАУЗЕ.</em>', 'pause.body': 'Таймер и соперники тоже отдыхают.',
  'pause.titleOnline': 'МЕНЮ <em>МАТЧА.</em>', 'pause.bodyOnline': 'Сетевой матч продолжается, пока открыто меню.',
  'pause.resume': 'ПРОДОЛЖИТЬ', 'pause.settings': 'НАСТРОЙКИ', 'pause.rules': 'ПРАВИЛА', 'pause.leave': 'ВЫЙТИ В МЕНЮ', 'pause.leaveOnline': 'ПОКИНУТЬ МАТЧ', 'pause.restart': 'НАЧАТЬ ЗАНОВО',
  'rules.kicker': 'ПРАВИЛА ТАЙНОГО СПИСКА', 'rules.title': 'ВЫПОЛНЯЙ <em>ЗАКАЗЫ.</em>',
  'rules.body': '<div class="rules"><p><b>1.</b> В начале каждый получает имя другого участника. Только устранение своей цели даёт +1 заказ.</p><p><b>2.</b> Толкай цель за край крыши или заманивай на жёлтую плиту. Взведи ловушку рядом с плитой: через 0,9 секунды она сработает. Она опасна и для тебя.</p><p><b>3.</b> Новая цель берётся из карточек выбывших: на них записаны их прежние цели. Если колода пуста, раздаётся случайная цель.</p><p><b>4.</b> Выбывшие возвращаются через 5 секунд с защитой на 2 секунды. За время матча набери больше заказов; при равенстве — ничья.</p><p><b>Маскировка</b> — 10 секунд в облике другого героя (перезарядка 25 секунд). Атака и взведение ловушки раскрывают тебя. <b>Пружина</b> сразу выбрасывает, <b>клетка</b> выводит через 2 секунды, <b>лёд</b> заставляет скользить к краю.</p></div>',
  'rules.keys': '<div class="keys"><h3>Клавиатура и мышь</h3><p><kbd>W A S D</kbd> / стрелки — движение · <kbd>Пробел</kbd> — толчок · <kbd>Shift</kbd> — рывок · <kbd>E</kbd> — ловушка · <kbd>Q</kbd> — маскировка · <kbd>R</kbd> — обзор · <kbd>Esc</kbd> — меню · перетаскивание мышью — поворот камеры, колесо — масштаб</p><h3>Геймпад</h3><p>Левый стик — движение · Ⓐ — толчок · Ⓑ / RB — рывок · Ⓧ — ловушка · Ⓨ — маскировка · LB — обзор · правый стик — камера · триггеры — масштаб · Start — меню</p></div>',
  'rules.close': 'ПОНЯТНО',
  'result.kicker': 'ВРЕМЯ ВЫШЛО · ИТОГИ МАТЧА', 'result.draw': '<em>НИЧЬЯ!</em>', 'result.win': 'ЭТО <em>ПОБЕДА!</em>', 'result.winner': 'ПОБЕДИТЕЛЬ — <em>{name}</em>',
  'result.yours': 'Твои заказы: <b>{n}</b>. Каждый заказ имел значение.', 'result.again': 'ЕЩЁ ОДИН МАТЧ', 'result.lobby': 'В ЛОББИ', 'result.menu': 'В МЕНЮ', 'result.waitHost': 'Хост запустит следующий матч',
  'result.note': 'Новые карточки. Новая охота.',
  'msg.ok': 'ОК', 'msg.cancel': 'ОТМЕНА', 'msg.error': 'ЧТО-ТО ПОШЛО НЕ ТАК',
  'msg.hostLeft': 'Хост покинул игру.', 'msg.connectFail': 'Не удалось подключиться. Проверь адрес и что хост создал игру.',
  'msg.version': 'У хоста другая версия игры ({v}). Обновитесь до одной версии.', 'msg.full': 'Лобби заполнено.', 'msg.kicked': 'Соединение с хостом потеряно.',
  'msg.steamJoinFail': 'Не удалось войти в лобби Steam.', 'msg.steamCreateFail': 'Не удалось создать лобби Steam.', 'msg.lanFail': 'Не удалось открыть порт {port}. Возможно, он занят другой программой.',
  'msg.joinFriend': 'Друг приглашает в лобби. Выйти из текущей игры и присоединиться?', 'msg.join': 'ПРИСОЕДИНИТЬСЯ', 'msg.noRoom': 'Комната не найдена.',
  'msg.webgl': 'Нужен WebGL. Включи аппаратное ускорение в настройках браузера или обнови драйвер видеокарты.', 'msg.assets': 'Не удалось загрузить героев. Перезапусти игру.',
  'msg.quit': 'Выйти из игры?', 'msg.quitYes': 'ВЫЙТИ',
  'spectate': 'НАБЛЮДЕНИЕ · ты войдёшь в следующий матч',
  'loading': 'Загрузка крыши…',
  'hero.fox.name': 'Фокси', 'hero.bunny.name': 'Моти', 'hero.frog.name': 'Лайм', 'hero.axolotl.name': 'Блю', 'hero.duck.name': 'Манго', 'hero.kitten.name': 'Юки', 'hero.raccoon.name': 'Нори', 'hero.mushroom.name': 'Пикси',
  'hero.fox.desc': 'Фиолетовый лисёнок · жёлтый шарф', 'hero.bunny.desc': 'Розовый зайчик · одно ухо набок', 'hero.frog.desc': 'Лягушка-детектив · маленькая кепка', 'hero.axolotl.desc': 'Голубой аксолотль · золотые очки',
  'hero.duck.desc': 'Утка-король · корона и плащ', 'hero.kitten.desc': 'Белый котёнок · жёлтая сумочка', 'hero.raccoon.desc': 'Енот-космонавт · жёлтая антенна', 'hero.mushroom.desc': 'Сиреневый дух · грибная шляпа',
  'you': 'Ты', 'player': 'Игрок'
};

const EN = {
  'brand.top': 'SECRET', 'brand.bottom': 'LIST',
  'phase.menu': 'READY FOR CHAOS', 'phase.lobby': 'LOBBY', 'phase.countdown': 'GET READY', 'phase.play': 'MATCH ON', 'phase.ended': 'MATCH OVER',
  'mode.solo': 'SOLO · {n} PLAYERS', 'mode.online': 'ONLINE · {h} HUMANS + {b} BOTS', 'mode.onlineNoBots': 'ONLINE · {h} PLAYERS',
  'aria.sound': 'Sound', 'aria.help': 'Rules', 'aria.camera': 'Arena overview · R', 'aria.pause': 'Menu',
  'contract.eyebrow': 'FOR YOUR EYES ONLY', 'contract.title': 'YOUR TARGET', 'contract.classified': 'CLASSIFIED', 'contract.reward': 'REWARD', 'contract.rewardValue': '+1 CONTRACT',
  'contract.waiting': 'DEALING…', 'contract.waitingDesc': 'Your card is revealed when the match starts', 'contract.none': 'NEW DEAL', 'contract.noneDesc': 'Wait for players to return',
  'contract.respawn': 'Back in {n} s', 'contract.masked': 'Your target is disguised — find them!',
  'scores.title': 'CONTRACT RACE', 'scores.foot': 'Contracts win, not survival', 'scores.bot': 'bot',
  'timer.label': 'TIME LEFT', 'location.arena': 'ARENA 01', 'location.name': 'Neon Rooftop',
  'minimap.you': 'YOU', 'minimap.target': 'TARGET',
  'ctl.move': 'move', 'ctl.push': 'push', 'ctl.trap': 'trap', 'ctl.dash': 'dash', 'ctl.mask': 'disguise', 'ctl.camera': 'rotate · wheel — zoom · R — overview', 'ctl.mouse': 'MOUSE',
  'ability.push': 'PUSH', 'ability.trap': 'TRAP', 'ability.mask': 'DISGUISE', 'ability.dash': 'DASH',
  'ability.pushKey': 'SPACE', 'ability.trapKey': 'E · NEAR A PLATE', 'ability.maskKey': 'Q · 10 SECONDS', 'ability.dashKey': 'SHIFT',
  'ability.pushPad': 'Ⓐ', 'ability.trapPad': 'Ⓧ · NEAR A PLATE', 'ability.maskPad': 'Ⓨ · 10 SECONDS', 'ability.dashPad': 'Ⓑ / RB',
  'ability.seconds': '{n} S',
  'trap.pulse': 'Pulse', 'trap.spring': 'Spring', 'trap.cage': 'Cage', 'trap.ice': 'Ice',
  'trapEffect.pulse': 'knock-out', 'trapEffect.spring': 'catapult', 'trapEffect.cage': 'capture', 'trapEffect.ice': 'slide',
  'near.key': 'E', 'near.pad': 'Ⓧ',
  'mask.status': 'DISGUISED · {n} S', 'mask.you': '▼ YOU · DISGUISED', 'label.you': '▼ YOU',
  'order.kicker': 'BULLSEYE!', 'order.title': 'CONTRACT COMPLETE', 'order.next': 'New target: {name}', 'order.nextNone': 'New target: pending',
  'countdown.go': 'HUNT!',
  'toast.start': 'Your target is {name}. Happy hunting!', 'toast.order': '+1 CONTRACT! A new card is in your pocket', 'toast.targetLost': 'Your target is out. You got a new card',
  'toast.newTarget': 'New target: {name}',
  'toast.eliminated': 'You were taken out! Back in 5 seconds', 'toast.respawn': 'You are back! Shielded for 2 seconds', 'toast.noTrap': 'Stand next to a yellow trap plate',
  'toast.trapArmed': '{trap} armed. Get off the plate!', 'toast.mask': 'Disguised as {name}. The bots lost your trail', 'toast.maskOnline': 'Disguised as {name}. Nobody will recognise you',
  'toast.unmask': 'Disguise blown!', 'toast.slip': 'Slippery! Steer away from the edge', 'toast.caught': 'Caught! The cage takes you out in 2 seconds', 'toast.turned': 'That was your hunter! One less threat',
  'toast.overview': 'Whole rooftop view', 'toast.follow': 'Camera follows you', 'toast.joined': '{name} joined', 'toast.left': '{name} left — a bot takes their place',
  'toast.leftLobby': '{name} left the lobby', 'toast.spectate': 'A match is running — you are spectating until the next round',
  'feed.order': '<b>{a}</b> completed a contract · {why}', 'feed.out': '{v} is out · {why}',
  'why.edge': 'off the roof', 'why.trap': 'trap', 'why.spring': 'spring', 'why.cage': 'cage',
  'menu.kicker': 'LIVING HEROES / BIG EYES', 'menu.title': 'NIGHT. <br>ROOFTOP. <br><em>YOUR TARGET.</em>',
  'menu.body': 'A name in your pocket. Your target on the roof.<br>Complete more secret contracts than anyone else.',
  'menu.solo': 'PLAY WITH BOTS', 'menu.online': 'PLAY WITH FRIENDS', 'menu.settings': 'SETTINGS', 'menu.rules': 'RULES', 'menu.quit': 'QUIT',
  'menu.hero': 'YOUR HERO', 'menu.note': 'Three minutes of chaos · up to 8 players · no last-man-standing',
  'online.title': 'PLAY WITH <em>FRIENDS</em>', 'online.kicker': 'UP TO 8 PLAYERS · BOTS FILL EMPTY SLOTS',
  'online.steam': 'STEAM', 'online.steamCreate': 'CREATE STEAM LOBBY', 'online.steamHint': 'Friends join from an invite or via “Join Game” in the Steam friends list.',
  'online.steamOff': 'Steam is not running — Steam lobbies are unavailable. Play over LAN or by IP.', 'online.steamOn': 'Signed in to Steam as {name}',
  'online.lan': 'LOCAL NETWORK / IP', 'online.lanCreate': 'HOST A GAME', 'online.lanHint': 'Friends connect to the address shown in the lobby. To play over the internet the host needs to forward port {port}.',
  'online.join': 'CONNECT', 'online.address': 'Host IP address', 'online.addressPh': '192.168.1.20', 'online.code': 'Room code', 'online.codePh': 'ABCD',
  'online.webCreate': 'CREATE ROOM', 'online.webHint': 'A room on this server. Friends open this page and enter the code.',
  'online.name': 'Your name', 'online.back': 'BACK', 'online.connecting': 'Connecting…',
  'online.unavailable': 'Online play is unavailable right now. Check your internet connection and try again later.', 'online.friends': 'WITH FRIENDS ONLINE', 'online.pfHint': 'Create a room and tell your friends the code shown in the lobby; they enter it in their game. Players connect to each other directly.', 'online.busy': 'Connecting…', 'msg.p2pFail': 'Could not reach the room. The host may have left, or the network blocks direct connections — try letting another player host.',
  'demo.badge': 'DEMO', 'demo.banner': 'One match against bots per day. Full game and online play on the Microsoft Store.', 'demo.get': 'FULL GAME', 'demo.limitTitle': "THAT'S IT <em>FOR TODAY</em>", 'demo.limitBody': 'The demo includes one match against bots per day. The full game on the Microsoft Store has unlimited matches, match length options and online play with friends.', 'demo.onlineTitle': 'PLAY WITH <em>FRIENDS</em>', 'demo.onlineBody': 'Online play is part of the full game on the Microsoft Store. The demo includes one match against bots per day.', 'demo.store': 'OPEN MICROSOFT STORE', 'demo.later': 'LATER',
  'lobby.title': 'LOBBY', 'lobby.steamSub': 'Steam lobby · friends only', 'lobby.lanSub': 'Address for friends: {addr}', 'lobby.codeSub': 'Room code: {code}',
  'lobby.players': 'PLAYERS', 'lobby.empty': 'Open', 'lobby.bot': 'Bot', 'lobby.host': 'host', 'lobby.you': 'you',
  'lobby.hero': 'PICK YOUR HERO', 'lobby.settings': 'MATCH SETTINGS', 'lobby.duration': 'Duration', 'lobby.minutes': '{n} min', 'lobby.bots': 'Bots fill empty slots',
  'lobby.invite': 'INVITE FRIENDS', 'lobby.start': 'START MATCH', 'lobby.waitHost': 'WAITING FOR HOST…', 'lobby.leave': 'LEAVE', 'lobby.needPlayers': 'You need at least one more player or bots',
  'lobby.copy': 'Copy', 'lobby.copied': 'Copied', 'lobby.inMatch': 'Match running', 'lobby.ping': '{n} ms',
  'settings.title': 'SETTINGS', 'settings.language': 'Language', 'settings.volume': 'Master volume', 'settings.music': 'Music', 'settings.sfx': 'Effects',
  'settings.quality': 'Graphics quality', 'settings.q.low': 'Low', 'settings.q.medium': 'Medium', 'settings.q.high': 'High', 'settings.q.ultra': 'Ultra',
  'settings.dynamic': 'Dynamic resolution', 'settings.fullscreen': 'Fullscreen', 'settings.fps': 'Show FPS', 'settings.privacy': 'Privacy', 'settings.privacyOpen': 'OPEN', 'settings.shake': 'Camera shake',
  'settings.tv': 'Big screen interface (TV)',
  'demo.bannerXbox': 'One match against bots per day. The full game with online play is on the Microsoft Store for Windows PCs.',
  'xbox.hint': 'To play with the controller, <b>hold ☰ (Menu)</b> and choose <b>Use game controls</b>. For full screen, <b>hold ⧉ (View)</b>.',
  'xbox.rules': '<div class="keys"><h3>Xbox · Microsoft Edge</h3><p>Hold <b>☰</b> and choose <b>Use game controls</b> so the controller plays the game instead of moving the cursor. Hold <b>☰</b> again to get the cursor back. Hold <b>⧉</b> for full screen. Ⓑ — back.</p></div>',
  'settings.back': 'DONE', 'settings.on': 'On', 'settings.off': 'Off', 'settings.name': 'Online name',
  'pause.kicker': 'BREATHE. YOUR TARGET CAN WAIT.', 'pause.title': 'GAME <em>PAUSED.</em>', 'pause.body': 'The timer and your rivals are resting too.',
  'pause.titleOnline': 'MATCH <em>MENU.</em>', 'pause.bodyOnline': 'The online match keeps running while this menu is open.',
  'pause.resume': 'RESUME', 'pause.settings': 'SETTINGS', 'pause.rules': 'RULES', 'pause.leave': 'MAIN MENU', 'pause.leaveOnline': 'LEAVE MATCH', 'pause.restart': 'RESTART',
  'rules.kicker': 'RULES OF THE SECRET LIST', 'rules.title': 'COMPLETE <em>CONTRACTS.</em>',
  'rules.body': '<div class="rules"><p><b>1.</b> At the start everybody gets the name of another player. Only taking out your own target scores +1 contract.</p><p><b>2.</b> Push your target off the roof or lure them onto a yellow plate. Arm a trap next to a plate: it fires after 0.9 seconds. It is dangerous for you too.</p><p><b>3.</b> New targets come from the cards of eliminated players — their old targets. If the deck is empty you get a random target.</p><p><b>4.</b> Eliminated players return after 5 seconds with a 2-second shield. Score the most contracts before time runs out; a tie is a draw.</p><p><b>Disguise</b> — 10 seconds looking like another hero (25-second cooldown). Attacking or arming a trap blows your cover. The <b>spring</b> launches you out, the <b>cage</b> takes you out after 2 seconds, <b>ice</b> sends you sliding towards the edge.</p></div>',
  'rules.keys': '<div class="keys"><h3>Keyboard & mouse</h3><p><kbd>W A S D</kbd> / arrows — move · <kbd>Space</kbd> — push · <kbd>Shift</kbd> — dash · <kbd>E</kbd> — trap · <kbd>Q</kbd> — disguise · <kbd>R</kbd> — overview · <kbd>Esc</kbd> — menu · drag — rotate camera, wheel — zoom</p><h3>Gamepad</h3><p>Left stick — move · Ⓐ — push · Ⓑ / RB — dash · Ⓧ — trap · Ⓨ — disguise · LB — overview · right stick — camera · triggers — zoom · Start — menu</p></div>',
  'rules.close': 'GOT IT',
  'result.kicker': 'TIME IS UP · MATCH RESULTS', 'result.draw': '<em>DRAW!</em>', 'result.win': 'YOU <em>WIN!</em>', 'result.winner': 'WINNER — <em>{name}</em>',
  'result.yours': 'Your contracts: <b>{n}</b>. Every one of them mattered.', 'result.again': 'ONE MORE MATCH', 'result.lobby': 'TO LOBBY', 'result.menu': 'MAIN MENU', 'result.waitHost': 'The host will start the next match',
  'result.note': 'New cards. A new hunt.',
  'msg.ok': 'OK', 'msg.cancel': 'CANCEL', 'msg.error': 'SOMETHING WENT WRONG',
  'msg.hostLeft': 'The host left the game.', 'msg.connectFail': 'Could not connect. Check the address and that the host has created a game.',
  'msg.version': 'The host runs a different game version ({v}). Update to the same version.', 'msg.full': 'The lobby is full.', 'msg.kicked': 'Lost connection to the host.',
  'msg.steamJoinFail': 'Could not join the Steam lobby.', 'msg.steamCreateFail': 'Could not create a Steam lobby.', 'msg.lanFail': 'Could not open port {port}. Another program may be using it.',
  'msg.joinFriend': 'A friend invites you to a lobby. Leave the current game and join?', 'msg.join': 'JOIN', 'msg.noRoom': 'Room not found.',
  'msg.webgl': 'WebGL is required. Enable hardware acceleration in your browser or update your graphics driver.', 'msg.assets': 'Could not load the heroes. Restart the game.',
  'msg.quit': 'Quit the game?', 'msg.quitYes': 'QUIT',
  'spectate': 'SPECTATING · you will join the next match',
  'loading': 'Loading the rooftop…',
  'hero.fox.name': 'Foxy', 'hero.bunny.name': 'Mochi', 'hero.frog.name': 'Lime', 'hero.axolotl.name': 'Blue', 'hero.duck.name': 'Mango', 'hero.kitten.name': 'Yuki', 'hero.raccoon.name': 'Nori', 'hero.mushroom.name': 'Pixie',
  'hero.fox.desc': 'Purple fox · yellow scarf', 'hero.bunny.desc': 'Pink bunny · one floppy ear', 'hero.frog.desc': 'Detective frog · tiny cap', 'hero.axolotl.desc': 'Blue axolotl · golden goggles',
  'hero.duck.desc': 'King duck · crown and cape', 'hero.kitten.desc': 'White kitten · yellow bag', 'hero.raccoon.desc': 'Space raccoon · yellow antenna', 'hero.mushroom.desc': 'Lilac spirit · mushroom hat',
  'you': 'You', 'player': 'Player'
};

const TABLES = { ru: RU, en: EN };
let lang = 'ru';

export const languages = [{ id: 'ru', name: 'Русский' }, { id: 'en', name: 'English' }];
export const getLang = () => lang;
export function setLang(l) { lang = TABLES[l] ? l : 'en'; document.documentElement.lang = lang; apply(); }

export function t(key, vars) {
  let s = TABLES[lang][key] ?? EN[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
  return s;
}

export function apply(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
  root.querySelectorAll('[data-i18n-attr]').forEach(el => {
    for (const pair of el.dataset.i18nAttr.split(';')) { const [attr, key] = pair.split(':'); if (attr && key) el.setAttribute(attr.trim(), t(key.trim())); }
  });
}

// Steam language names → ours; browser locale as a fallback.
export function detectLanguage(steamLang) {
  if (steamLang) return /russian|ukrainian|belarus/i.test(steamLang) ? 'ru' : 'en';
  const nav = (navigator.languages || [navigator.language || 'en']).join(',').toLowerCase();
  return /(^|,)(ru|uk|be|kk)/.test(nav) ? 'ru' : 'en';
}

export const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
