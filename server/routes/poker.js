const express = require('express');
const router = express.Router();
const { PokerGame, User } = require('../models');
const { 
  createDeck, 
  shuffleDeck, 
  dealCards, 
  dealCommunityCards, 
  nextRound, 
  nextTurn,
  determineWinner
} = require('../utils/pokerUtils');
const crypto = require('crypto');

// ДОБАВЛЕНО: защита от множественных запусков ботов для одной игры
const processingGames = new Set();
// ДОБАВЛЕНО: защита от множественных запусков следующих игр
const startingNextGames = new Set();

/**
 * @route   GET /api/poker/test
 * @desc    Тестовый эндпоинт
 * @access  Public
 */
router.get('/test', (req, res) => {
  console.log('[TEST] Тестовый эндпоинт вызван');
  res.json({ message: 'Poker router работает!', timestamp: new Date() });
});

/**
 * @route   POST /api/poker/debug
 * @desc    Отладочный эндпоинт для проверки POST-запросов
 * @access  Public
 */
router.post('/debug', (req, res) => {
  console.log('[DEBUG] Отладочный POST эндпоинт вызван');
  console.log('Параметры:', req.params);
  console.log('Тело запроса:', req.body);
  res.json({ 
    message: 'POST route работает!', 
    params: req.params,
    body: req.body,
    timestamp: new Date() 
  });
});

/**
 * @route   POST /api/poker/create
 * @desc    Создание новой покерной игры с установкой блайндов
 * @access  Public
 */
router.post('/create', async (req, res) => {
  try {
    console.log('[CREATE] ================ СОЗДАНИЕ ИГРЫ НАЧАТО ================');
    const { userId } = req.body;
    
    // ИСПРАВЛЕНО: Пытаемся получить данные пользователя из базы данных, но не требуем его обязательно
    let user = null;
    let username = 'Игрок';
    
    try {
      if (userId && userId.toString().match(/^\d+$/)) {
        // Если userId - число, ищем в базе
        user = await User.findByPk(userId);
        if (user) {
          username = user.username;
          console.log('Получен username из базы:', username);
        } else {
          console.log(`Пользователь с ID ${userId} не найден в базе, используем значение по умолчанию`);
          username = `Игрок${userId}`;
        }
      } else {
        // Если userId - строка, используем как username
        username = userId || 'Игрок';
        console.log(`userId не является числом, используем как username: ${username}`);
      }
    } catch (userError) {
      console.log(`Ошибка при поиске пользователя, используем значение по умолчанию:`, userError.message);
      username = userId || 'Игрок';
    }
    console.log('Получен username из базы:', username);
    
    console.log('=== Создание новой игры ===');
    console.log('req.body:', req.body);
    console.log('userId:', userId, 'username:', username);
    
    // ИСПРАВЛЕНИЕ: Размещаем реального игрока НЕ на UTG позиции для автоматического запуска ботов
    // Устанавливаем позиции так чтобы реальный игрок был дилером, а UTG был ботом
    const realPlayerPosition = 0; // Реальный игрок всегда на позиции 0
    const dealerPosition = realPlayerPosition; // Реальный игрок = дилер
    const sbPosition = (dealerPosition + 1) % 4; // Small Blind - бот
    const bbPosition = (dealerPosition + 2) % 4; // Big Blind - бот  
    const utgPosition = (dealerPosition + 3) % 4; // UTG - бот (первый ход)
    
    console.log(`Позиции: Игрок=${realPlayerPosition} (дилер), SB=${sbPosition}, BB=${bbPosition}, UTG=${utgPosition}`);
    
    // Создаем массив игроков
    const players = [
      {
        user: userId,
        username: username,
      chips: 1000,
      cards: [],
        position: 0,
      currentBet: 0,
        isBot: false,
      isDealer: false,
        isSmallBlind: false,
        isBigBlind: false,
        isUTG: false
      }
    ];
    
    // Добавляем ботов 
    for (let i = 1; i <= 3; i++) {
      players.push({
        username: `Bot ${i}`,
        chips: 1000,
        cards: [],
        position: i,
        isBot: true,
        currentBet: 0,
        isDealer: false,
        isSmallBlind: false,
        isBigBlind: false,
        isUTG: false
      });
    }
    
    // Устанавливаем позиции в зависимости от дилера
    players[dealerPosition].isDealer = true;
    players[sbPosition].isSmallBlind = true;
    players[bbPosition].isBigBlind = true;
    players[utgPosition].isUTG = true;
    
    // Устанавливаем начальные банки с учетом блайндов
    players[sbPosition].chips = 990; // Минус малый блайнд
    players[sbPosition].currentBet = 10;
    players[bbPosition].chips = 980; // Минус большой блайнд
    players[bbPosition].currentBet = 20;
    
    console.log('Игроки после установки позиций:');
    players.forEach((player, index) => {
      console.log(`Игрок ${index}: chips=${player.chips}, bet=${player.currentBet}, isDealer=${player.isDealer}, isSB=${player.isSmallBlind}, isBB=${player.isBigBlind}, isUTG=${player.isUTG}`);
    });
    
    // Создаем объект игры с явным указанием всех полей
    const gameData = {
      type: 'poker',
      players: players.map(player => ({
        user: player.user || null,
        username: player.username,
        chips: player.chips,
        cards: player.cards || [],
        position: player.position,
        currentBet: player.currentBet,
        isBot: player.isBot,
        isDealer: player.isDealer,
        isSmallBlind: player.isSmallBlind,
        isBigBlind: player.isBigBlind,
        isUTG: player.isUTG,
        folded: false,
        isAllIn: false,
        hasActed: false
      })),
      pot: 30,
      deck: createDeck(),
      status: 'playing',
      settings: {
        maxPlayers: 4,
        smallBlind: 10,
        bigBlind: 20,
        currentTurn: utgPosition,
        currentRound: 'preflop',
        dealerPosition: dealerPosition,
        communityCards: [] // ДОБАВЛЕНО: Инициализируем пустой массив общих карт
      },
      winner: null,
      showdown: false,
      user_id: userId
    };
    
    console.log('Создаем игру с данными:', JSON.stringify(gameData, null, 2));
    
    const newGame = await PokerGame.create(gameData);
    
    // Раздаем карты
    dealCards(newGame);
    
    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Явно помечаем JSON поля как измененные для Sequelize после раздачи карт
    newGame.changed('players', true);
    newGame.changed('deck', true);
    
    // Сохраняем изменения после раздачи карт
    await newGame.save();
    
    console.log(`Игра создана: Дилер=${dealerPosition}, SB=${sbPosition}, BB=${bbPosition}, UTG=${utgPosition}`);
    console.log('Банк игры:', newGame.pot);
    console.log('ID созданной игры:', newGame.id);
    
    // Отладка: проверяем все условия для запуска бота
    console.log('=== ОТЛАДКА ЗАПУСКА БОТОВ ПРИ СОЗДАНИИ ===');
    console.log('newGame.status:', newGame.status);
    console.log('newGame.settings.currentTurn:', newGame.settings.currentTurn);
    const currentTurn = newGame.settings.currentTurn;
    console.log('Игрок на ходе:', newGame.players[currentTurn]);
    if (newGame.players[currentTurn]) {
      console.log('Это бот?:', newGame.players[currentTurn].isBot);
      console.log('Не сбросил карты?:', !newGame.players[currentTurn].folded);
      console.log('Еще не ходил?:', !newGame.players[currentTurn].hasActed);
    }
    
    // ИСПРАВЛЕНО: более надежный запуск ботов если первый ход у бота
    if (newGame.players[currentTurn] && newGame.players[currentTurn].isBot && !newGame.players[currentTurn].folded) {
      console.log(`[CREATE] Запускаем первого бота ${newGame.players[currentTurn].username}`);
      
      const gameId = newGame.id.toString();
      setTimeout(async () => {
        try {
          console.log(`[CREATE] ⚡ ВЫПОЛНЯЕМ processBotAction для созданной игры ${gameId}`);
          
          // Проверяем что первый игрок действительно бот и должен ходить
          const freshGame = await PokerGame.findByPk(gameId);
          const freshCurrentTurn = freshGame.settings.currentTurn;
          if (freshGame && 
              freshGame.status === 'playing' && 
              freshGame.players[freshCurrentTurn] && 
              freshGame.players[freshCurrentTurn].isBot &&
              !freshGame.players[freshCurrentTurn].folded &&
              !freshGame.players[freshCurrentTurn].hasActed) {
            
            console.log(`[CREATE] ✅ Все условия выполнены, запускаем бота ${freshGame.players[freshCurrentTurn].username}`);
            await processBotAction(gameId);
          } else {
            console.log(`[CREATE] ❌ Условия для запуска бота не выполнены`);
          }
        } catch (error) {
          console.error('[CREATE] ❌ Ошибка при запуске бота в созданной игре:', error);
        }
      }, 4000); // ИЗМЕНЕНО: увеличил с 1000 до 4000ms (4 секунды)
    }
    
    // Возвращаем данные игры с обратной совместимостью
    const responseData = newGame.toJSON();
    responseData.currentTurn = newGame.settings.currentTurn;
    responseData.currentRound = newGame.settings.currentRound;
    responseData.dealerPosition = newGame.settings.dealerPosition;
    
    // Возвращаем currentTurn в корне ответа для обратной совместимости
    res.json({ 
      gameId: newGame.id,
      currentTurn: newGame.settings.currentTurn
    });
  } catch (error) {
    console.error('Ошибка при создании игры:', error);
    res.status(500).json({ message: 'Ошибка при создании игры' });
  }
});

async function ensureMinimumChips(game) {
  try {
    // Убеждаемся что у всех есть минимальные фишки
    let gameChanged = false;
    
    game.players.forEach(player => {
      if (player.chips < 10) {
        player.chips = 1000;
        gameChanged = true;
        console.log(`Пополнили фишки игрока ${player.username} до 1000`);
      }
    });
    
    if (gameChanged) {
      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Явно помечаем JSON поля как измененные для Sequelize

      game.changed('players', true);

      game.changed('pot', true);

      game.changed('settings', true);

      

      await game.save();
    }
  } catch (error) {
    console.error('Ошибка при пополнении фишек:', error);
  }
}

/**
 * @route   GET /api/poker/:gameId
 * @desc    Получение данных конкретной игры
 * @access  Public
 */
router.get('/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;
    
    let game = await PokerGame.findByPk(gameId);
    if (!game) {
      return res.status(404).json({ message: 'Игра не найдена' });
    }

    // ИСПРАВЛЕНО: проверка следующей игры через Sequelize
    if (game.nextGameId) {
      try {
        const newGame = await PokerGame.findByPk(game.nextGameId);
        if (newGame) {
          console.log(`Переключение на следующую игру: ${game.nextGameId}`);
          game = newGame;
        }
      } catch (error) {
        console.error('Ошибка при получении следующей игры:', error);
      }
    }
    
    // Убедимся что у всех есть минимальные фишки
    await ensureMinimumChips(game);
    
    // ДОБАВЛЕНО: проверяем если игра была заменена новой
    if (game.status === 'replaced' && game.nextGameId) {
      console.log(`[GET] Игра ${gameId} была заменена новой ${game.nextGameId}`);
      
      // Получаем новую игру
      const newGame = await PokerGame.findByPk(game.nextGameId);
      if (newGame) {
        console.log(`[GET] Перенаправляем на новую игру ${game.nextGameId}`);
        
        // Возвращаем новую игру с указанием что это новая игра
        return res.status(200).json({
          ...newGame.toJSON(),
          currentTurn: newGame.settings.currentTurn,
          currentRound: newGame.settings.currentRound,
          dealerPosition: newGame.settings.dealerPosition,
          isNewGame: true,
          newGameId: game.nextGameId,
          oldGameId: gameId
        });
      } else {
        console.log(`[GET] Новая игра ${game.nextGameId} не найдена`);
      }
    }
    
    // Явно устанавливаем карты как видимые для реального игрока (non-bot)
    if (game.players && game.players.length > 0) {
      for (let i = 0; i < game.players.length; i++) {
        if (!game.players[i].isBot && game.players[i].cards && game.players[i].cards.length > 0) {
          // Делаем карты видимыми для реального игрока
          game.players[i].cards.forEach(card => {
            card.hidden = false;
          });
        }
      }
    }
    
    // ДОБАВЛЕНО: принудительная проверка ботов только если текущий игрок - бот который еще не ходил
    const gameCurrentTurn = game.settings.currentTurn;
    if (game.status === 'playing' && 
        gameCurrentTurn !== undefined &&
        gameCurrentTurn >= 0 && 
        gameCurrentTurn < game.players.length &&
        game.players[gameCurrentTurn] && 
        game.players[gameCurrentTurn].isBot && 
        !game.players[gameCurrentTurn].folded &&
        !game.players[gameCurrentTurn].hasActed &&
        !processingGames.has(gameId.toString())) { // ИСПРАВЛЕНО: добавлена проверка на уже обрабатываемую игру и валидность currentTurn
      
      console.log(`[GET] 🤖 ПРИНУДИТЕЛЬНАЯ ПРОВЕРКА БОТА в GET-запросе`);
      console.log(`[GET] Бот ${game.players[gameCurrentTurn].username} (позиция ${gameCurrentTurn}) должен сделать ход`);
      console.log(`[GET] folded: ${game.players[gameCurrentTurn].folded}, hasActed: ${game.players[gameCurrentTurn].hasActed}`);
      console.log(`[GET] currentRound: ${game.settings.currentRound}`);
      
      // Запускаем бота с задержкой чтобы сначала вернуть ответ клиенту
      setImmediate(async () => {
        try {
          console.log(`[GET] Запускаем processBotAction для бота ${game.players[gameCurrentTurn].username}`);
          await processBotAction(gameId);
        } catch (error) {
          console.error('[GET] Ошибка при принудительном запуске бота:', error);
        }
      });
    } else if (game.status === 'playing' && 
               gameCurrentTurn !== undefined && 
               gameCurrentTurn >= 0 && 
               gameCurrentTurn < game.players.length && 
               game.players[gameCurrentTurn]) {
      // ОТЛАДКА: логируем почему бот не запускается
      const currentPlayer = game.players[gameCurrentTurn];
      console.log(`[GET] 🔍 Бот НЕ запускается:`);
      console.log(`[GET] - isBot: ${currentPlayer.isBot}`);
      console.log(`[GET] - folded: ${currentPlayer.folded}`);
      console.log(`[GET] - hasActed: ${currentPlayer.hasActed}`);
      console.log(`[GET] - processing: ${processingGames.has(gameId.toString())}`);
      console.log(`[GET] - currentRound: ${game.settings.currentRound}`);
    } else if (game.status === 'playing') {
      console.log(`[GET] ⚠️ Игра активна, но проблемы с currentTurn: ${gameCurrentTurn} (должен быть от 0 до ${game.players.length - 1})`);
    }
    
    // Возвращаем данные игры с обратной совместимостью
    const gameData = game.toJSON();
    gameData.currentTurn = game.settings.currentTurn;
    gameData.currentRound = game.settings.currentRound;
    gameData.dealerPosition = game.settings.dealerPosition;
    
    res.status(200).json(gameData);
  } catch (error) {
    console.error('Ошибка при получении данных игры:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * @route   POST /api/poker/:gameId/action
 * @desc    Обработка действий игрока в покере
 * @access  Public
 */
router.post('/:gameId/action', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { userId, action, amount = 0 } = req.body;
    
    console.log(`Получено действие: ${action}, игрок: ${userId}, сумма: ${amount}`);
    
    // Получаем игру из базы данных
    let game = await PokerGame.findByPk(gameId);
    if (!game) {
      return res.status(404).json({ message: 'Игра не найдена' });
    }
    
    // ДОБАВЛЕНО: проверяем если игра была заменена новой
    if (game.status === 'replaced' && game.nextGameId) {
      console.log(`[ACTION] Игра ${gameId} была заменена новой ${game.nextGameId}, перенаправляем действие`);
      
      // Получаем новую игру
      const newGame = await PokerGame.findByPk(game.nextGameId);
      if (newGame) {
        console.log(`[ACTION] Перенаправляем действие на новую игру ${game.nextGameId}`);
        
        // Возвращаем ответ с указанием новой игры
        return res.status(200).json({
          redirectToNewGame: true,
          newGameId: game.nextGameId,
          oldGameId: gameId,
          message: 'Игра была заменена новой. Используйте новый ID.'
        });
      } else {
        console.log(`[ACTION] Новая игра ${game.nextGameId} не найдена`);
        return res.status(404).json({ message: 'Новая игра не найдена' });
      }
    }
    
    // Находим игрока
    console.log(`[ACTION-DEBUG] Поиск игрока userId: ${userId} (тип: ${typeof userId})`);
    console.log(`[ACTION-DEBUG] Всего игроков в игре: ${game.players.length}`);
    game.players.forEach((p, i) => {
      console.log(`[ACTION-DEBUG] Игрок ${i}: user=${p.user} (тип: ${typeof p.user}), username=${p.username}, isBot=${p.isBot}`);
      console.log(`[ACTION-DEBUG] Сравнение: p.user (${p.user}) === userId (${userId}) = ${p.user && p.user.toString() === userId.toString()}`);
    });
    
    // ИСПРАВЛЕНО: ищем игрока по user ID или username с улучшенной логикой
    const playerIndex = game.players.findIndex(p => {
      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Проверяем строгое соответствие user ID
      if (p.user !== null && p.user !== undefined) {
        const playerUserId = p.user.toString();
        const requestUserId = userId.toString();
        if (playerUserId === requestUserId) {
          console.log(`[ACTION-DEBUG] ✅ Игрок найден по user ID: ${playerUserId}`);
          return true;
        }
      }
      
      // ДОБАВЛЕНО: Дополнительная проверка по username для реальных игроков
      if (!p.isBot && p.username && p.username.toString() === userId.toString()) {
        console.log(`[ACTION-DEBUG] ✅ Игрок найден по username: ${p.username}`);
        return true;
      }
      
      return false;
    });
    
    console.log(`[ACTION-DEBUG] Результат поиска playerIndex: ${playerIndex}`);
    
    if (playerIndex === -1) {
      console.log(`[ACTION-DEBUG] ❌ Игрок не найден ни по user ID, ни по username`);
      return res.status(400).json({ message: 'Игрок не найден в игре' });
    }
    
    // ИСПРАВЛЕНО: Улучшенная проверка хода игрока
    const currentTurn = game.settings.currentTurn;
    const currentPlayer = game.players[currentTurn];
    
    // Проверяем что сейчас ход этого игрока
    if (currentTurn !== playerIndex) {
      console.log(`[ACTION-DEBUG] ❌ Не ваш ход! currentTurn=${currentTurn}, playerIndex=${playerIndex}`);
      console.log(`[ACTION-DEBUG] Текущий игрок: ${currentPlayer?.username}, isBot: ${currentPlayer?.isBot}`);
      return res.status(400).json({ 
        message: 'Сейчас не ваш ход',
        currentTurn: currentTurn,
        currentPlayer: currentPlayer?.username,
        isBot: currentPlayer?.isBot
      });
    }
    
    // ДОБАВЛЕНО: Дополнительная проверка - если сейчас ход бота, то человек не может ходить
    if (currentPlayer && currentPlayer.isBot) {
      console.log(`[ACTION-DEBUG] ❌ Сейчас ход бота ${currentPlayer.username}, человек не может ходить`);
      return res.status(400).json({ 
        message: `Сейчас ход бота ${currentPlayer.username}`,
        currentTurn: currentTurn,
        currentPlayer: currentPlayer.username,
        isBot: true
      });
    }
    
    const player = game.players[playerIndex];
    
    // Проверяем что игрок не сбросил карты
    if (player.folded) {
      return res.status(400).json({ message: 'Вы уже сбросили карты в этом раунде' });
    }
    
    // ИСПРАВЛЕНО: строгая проверка hasActed для всех действий кроме fold и исключений
    if (player.hasActed) {
      console.log(`[ACTION] Игрок ${player.username} уже делал ход в этом раунде`);
      
      // Разрешаем fold всегда
      if (action === 'fold') {
        console.log(`[ACTION] Разрешаем fold даже после хода`);
      } else {
        // Проверяем если это рейз и игрок должен ответить на новую ставку
        const currentBet = Math.max(...game.players.map(p => p.currentBet));
        if (player.currentBet < currentBet) {
          console.log(`[ACTION] Но есть новая ставка для ответа: ${currentBet} vs ${player.currentBet}`);
          player.hasActed = false; // Сбрасываем флаг чтобы игрок мог ответить
        } else {
          console.log(`[ACTION] ❌ БЛОКИРОВКА: игрок уже сделал ход и нет новых ставок`);
          return res.status(400).json({ message: 'Вы уже сделали ход в этом раунде' });
        }
      }
    }
    
    const currentBet = Math.max(...game.players.map(p => p.currentBet));
    
    // Обрабатываем действие
    switch (action) {
      case 'fold':
        player.folded = true;
        player.hasActed = true;
        console.log(`Игрок ${player.username} сбросил карты`);
        break;
        
      case 'call':
        const callAmount = currentBet - player.currentBet;
        if (player.chips >= callAmount) {
          player.chips -= callAmount;
          player.currentBet += callAmount;
          game.pot += callAmount;
        player.hasActed = true;
          console.log(`Игрок ${player.username} уравнял ставку: ${callAmount}`);
        } else {
          return res.status(400).json({ message: 'Недостаточно фишек для колла' });
        }
        break;
        
      case 'check':
        if (player.currentBet === currentBet) {
      player.hasActed = true;
          console.log(`Игрок ${player.username} чекнул`);
        } else {
          return res.status(400).json({ message: 'Нельзя чекнуть, есть ставка для уравнения' });
        }
        break;
        
      case 'bet':
      case 'raise':
      const betAmount = parseInt(amount);
        const minRaise = currentBet + 20; // Минимальный рейз = текущая ставка + размер большого блайнда
        
        if (betAmount < minRaise) {
          return res.status(400).json({ message: `Минимальная ставка: ${minRaise}` });
        }
        
        const totalBetNeeded = betAmount - player.currentBet;
        if (player.chips >= totalBetNeeded) {
          player.chips -= totalBetNeeded;
          game.pot += totalBetNeeded;
          player.currentBet = betAmount;
        player.hasActed = true;
        
          // ИСПРАВЛЕНО: сбрасываем hasActed только у НЕ сфолженных игроков при рейзе
          game.players.forEach((p, idx) => {
            if (idx !== playerIndex && !p.folded) {
              p.hasActed = false;
            }
          });
      
          console.log(`Игрок ${player.username} поставил: ${betAmount}`);
          } else {
          return res.status(400).json({ message: 'Недостаточно фишек для ставки' });
        }
        break;
        
      default:
      return res.status(400).json({ message: 'Неизвестное действие' });
    }
    
    // ИСПРАВЛЕНО: улучшенная логика переходов ходов
    const activePlayers = game.players.filter(p => !p.folded);
    console.log(`[ACTION] Активных игроков: ${activePlayers.length}`);
    
    // ДОБАВЛЕНО: детальное логирование состояния всех игроков после действия
    console.log(`[ACTION] ===== СОСТОЯНИЕ ВСЕХ ИГРОКОВ ПОСЛЕ ДЕЙСТВИЯ =====`);
    game.players.forEach((p, idx) => {
      console.log(`[ACTION] Игрок ${idx}: ${p.username}, folded: ${p.folded}, hasActed: ${p.hasActed}, bet: ${p.currentBet}`);
    });
    console.log(`[ACTION] ===================================================`);
    
    if (activePlayers.length === 1) {
      // Только один игрок остался - он победитель и получает банк (НЕ шоудаун)
      const winner = activePlayers[0];
      winner.chips += game.pot;
      game.winner = winner.username;
      game.status = 'finished';
      game.showdown = false; // ДОБАВЛЕНО: НЕ шоудаун - карты не показываем
      console.log(`Игра завершена БЕЗ шоудауна. Победитель: ${game.winner}, получил ${game.pot} фишек`);
    } else {
      // ИСПРАВЛЕНО: правильная проверка игроков которые еще должны сделать ход
      // Игрок должен быть активным (не folded) И не делал ход в этом раунде
      const playersToAct = activePlayers.filter(p => !p.hasActed);
      
      // ДОБАВЛЕНО: проверяем также что все активные игроки имеют одинаковую ставку (кроме all-in)
      const maxBet = Math.max(...activePlayers.map(p => p.currentBet));
      const playersNeedToMatchBet = activePlayers.filter(p => p.currentBet < maxBet && !p.isAllIn);
      
      console.log(`[ACTION] Игроков ожидают хода: ${playersToAct.length}`);
      console.log(`[ACTION] Игроков нужно доставить ставку: ${playersNeedToMatchBet.length}`);
      
      // ДОБАВЛЕНО: детальное логирование для отладки перехода к раундам
      console.log(`[ACTION] ===== АНАЛИЗ ПЕРЕХОДА К РАУНДУ =====`);
      console.log(`[ACTION] maxBet: ${maxBet}`);
      console.log(`[ACTION] Все активные игроки:`);
      activePlayers.forEach((p, idx) => {
        console.log(`[ACTION] - ${p.username}: hasActed=${p.hasActed}, bet=${p.currentBet}, needsBet=${p.currentBet < maxBet}`);
      });
      console.log(`[ACTION] Условие для перехода: playersToAct=${playersToAct.length} == 0 && playersNeedToMatchBet=${playersNeedToMatchBet.length} == 0`);
      console.log(`[ACTION] =======================================`);

      playersToAct.forEach((p, idx) => {
        console.log(`[ACTION] Ожидает хода ${idx}: ${p.username}, currentBet: ${p.currentBet}, folded: ${p.folded}`);
      });

      // ИСПРАВЛЕНО: переходим к следующему раунду только если все сделали ход И все ставки равны
      if (playersToAct.length === 0 && playersNeedToMatchBet.length === 0) {
        console.log(`[ACTION] 🎯 ВСЕ ИГРОКИ ЗАВЕРШИЛИ ТОРГИ - ПЕРЕХОД К СЛЕДУЮЩЕМУ РАУНДУ!`);
        await advanceToNextRound(game);
        
        // ВАЖНО: сохраняем игру после перехода к следующему раунду
        // ИСПРАВЛЕНО: используем Sequelize сохранение вместо MongoDB
        // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Явно помечаем JSON поля как измененные для Sequelize
        game.changed('players', true);
        game.changed('pot', true);
        game.changed('settings', true);
        
        await game.save();
        
        console.log(`[ACTION] 🃏 Раунд изменен на: ${game.settings.currentRound}`);
        console.log(`[ACTION] 🂡 Общие карты: ${game.settings?.communityCards?.length || 0}`);
        
        return res.json({
          success: true,
          game: game,
          message: `Переход к раунду ${game.settings.currentRound}`
        });
      }

      // Найти следующего игрока который должен делать ход
      let nextPlayerIndex = playerIndex;
      let attempts = 0;
      
      do {
        nextPlayerIndex = (nextPlayerIndex + 1) % game.players.length;
        attempts++;
        if (attempts > game.players.length) {
          console.log(`[ACTION] ⚠️ ОШИБКА: Не удалось найти следующего игрока`);
          return res.status(500).json({ message: 'Ошибка определения следующего игрока' });
        }
      } while (game.players[nextPlayerIndex].folded || game.players[nextPlayerIndex].hasActed);

      const nextPlayer = game.players[nextPlayerIndex];
      console.log(`[ACTION] Найден следующий игрок: ${nextPlayer.username} (позиция ${nextPlayerIndex})`);
      console.log(`[ACTION] - hasActed: ${nextPlayer.hasActed}, currentBet: ${nextPlayer.currentBet}, needsBet: ${maxBet}`);
      console.log(`[ACTION] Ход переходит к игроку ${nextPlayerIndex} (${nextPlayer.username})`);

      game.settings.currentTurn = nextPlayerIndex;
    }
    
    // Сохраняем игру используя Sequelize
    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Явно помечаем JSON поля как измененные для Sequelize

    game.changed('players', true);

    game.changed('pot', true);

    game.changed('settings', true);

    

    await game.save();
    
    // ДОБАВЛЕНО: детальное логирование сохранения игры
    console.log(`[ACTION] ===== ИГРА СОХРАНЕНА =====`);
    console.log(`[ACTION] ID сохраненной игры: ${game.id}`);
    console.log(`[ACTION] gameId из параметров: ${gameId}`);
    console.log(`[ACTION] currentTurn после сохранения: ${game.settings.currentTurn}`);
    
    // Если игра завершена - автоматически запускаем следующую через 3 секунды
    if (game.status === 'finished') {
      console.log('==================== ИГРА ЗАВЕРШЕНА ПОСЛЕ ДЕЙСТВИЯ ИГРОКА ====================');
      console.log(`Победитель: ${game.winner}`);
      console.log(`Банк: ${game.pot}`);
      console.log('Запускаем следующую игру через 3 секунды...');
      
      // ДОБАВЛЕНО: защита от дублирующихся запусков
      const gameIdStr = game.id.toString();
      if (!startingNextGames.has(gameIdStr)) {
        startingNextGames.add(gameIdStr);
        
        setTimeout(async () => {
          try {
            console.log('==================== ЗАПУСК СЛЕДУЮЩЕЙ ИГРЫ ====================');
            const newGame = await startNextGame(game);
            console.log('==================== СЛЕДУЮЩАЯ ИГРА ЗАПУЩЕНА ====================');
            
            // Удаляем из защитного множества после успешного запуска
            startingNextGames.delete(gameIdStr);
          } catch (error) {
            console.error('Ошибка при автозапуске следующей игры после действия игрока:', error);
            startingNextGames.delete(gameIdStr);
          }
        }, 3000);
      } else {
        console.log('Следующая игра уже запускается для', gameIdStr);
      }
    }
    
    console.log(`Следующий ход: игрок ${game.settings.currentTurn}, раунд: ${game.settings.currentRound}`);
    console.log(`Текущий игрок: ${game.players[game.settings.currentTurn]?.username}, isBot: ${game.players[game.settings.currentTurn]?.isBot}, folded: ${game.players[game.settings.currentTurn]?.folded}`);
    
    // ДОБАВЛЕНО: детальное логирование перед запуском бота
    console.log(`[ACTION] ============ ДЕТАЛЬНАЯ ПРОВЕРКА ПЕРЕД ЗАПУСКОМ БОТА ============`);
    console.log(`[ACTION] game.settings.currentTurn: ${game.settings.currentTurn}`);
    console.log(`[ACTION] game.status: ${game.status}`);
    if (game.players[game.settings.currentTurn]) {
      console.log(`[ACTION] Игрок на позиции ${game.settings.currentTurn}: ${game.players[game.settings.currentTurn].username}`);
      console.log(`[ACTION] isBot: ${game.players[game.settings.currentTurn].isBot}`);
      console.log(`[ACTION] folded: ${game.players[game.settings.currentTurn].folded}`);
      console.log(`[ACTION] hasActed: ${game.players[game.settings.currentTurn].hasActed}`);
    }
    
    // ИСПРАВЛЕНО: улучшенная цепочка автозапуска ботов с защитой от бесконечного цикла
    if (game.status === 'playing' && 
        game.settings.currentTurn !== undefined &&
        game.players[game.settings.currentTurn] && 
        game.players[game.settings.currentTurn].isBot && 
        !game.players[game.settings.currentTurn].folded &&
        !game.players[game.settings.currentTurn].hasActed) {
      
      console.log(`[ACTION] Запускаем следующего бота: ${game.players[game.settings.currentTurn].username} (позиция ${game.settings.currentTurn})`);
      
      // ДОБАВЛЕНО: логирование перед запуском следующего бота
      console.log(`[ACTION] ===== ЗАПУСК СЛЕДУЮЩЕГО БОТА =====`);
      console.log(`[ACTION] Передаем gameId: ${gameId}`);
      console.log(`[ACTION] ID текущей игры: ${game.id}`);
      console.log(`[ACTION] currentTurn для следующего бота: ${game.settings.currentTurn}`);
      
      // Добавляем ЗНАЧИТЕЛЬНУЮ задержку чтобы избежать бесконечного цикла
      setTimeout(() => {
        processBotAction(gameId);
      }, 5000); // ИЗМЕНЕНО: увеличил с 2000 до 5000ms (5 секунд) для более медленной игры
    } else {
      console.log('[ACTION] Цепочка ботов остановлена');
      if (game.status !== 'playing') {
        console.log('- игра завершена, статус:', game.status);
      } else if (!game.players[game.settings.currentTurn]?.isBot) {
        console.log('- следующий ход человека:', game.players[game.settings.currentTurn]?.username);
      } else if (game.players[game.settings.currentTurn]?.folded) {
        console.log('- следующий игрок уже сбросил карты');
      } else if (game.players[game.settings.currentTurn]?.hasActed) {
        console.log('- следующий игрок уже сделал ход');
      }
    }
    
    // ИСПРАВЛЕНО: Возвращаем правильную структуру ответа
    res.json({
      id: game.id,
      type: game.type,
      players: game.players,
      pot: game.pot,
      deck: game.deck,
      status: game.status,
      settings: game.settings,
      winner: game.winner,
      showdown: game.showdown
    });
    
  } catch (error) {
    console.error('Ошибка при обработке действия:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * @route   POST /api/poker/:gameId/force-bot
 * @desc    Принудительный запуск застрявшего бота
 * @access  Public
 */
router.post('/:gameId/force-bot', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { botIndex } = req.body;
    
    console.log(`[FORCE-BOT] Получен запрос на принудительный запуск бота ${botIndex} для игры ${gameId}`);
    
    let game = await PokerGame.findByPk(gameId);
    if (!game) {
      console.log(`[FORCE-BOT] Игра ${gameId} не найдена`);
      return res.status(404).json({ message: 'Игра не найдена' });
    }
    
    console.log(`[FORCE-BOT] Игра найдена. Статус: ${game.status}, currentTurn: ${game.currentTurn}`);
    console.log(`[FORCE-BOT] Запрашиваемый бот: ${botIndex}, текущий игрок: ${game.players[game.currentTurn]?.username}`);
    
    // Запускаем бота независимо от проверок (для отладки)
    console.log(`[FORCE-BOT] Запускаем processBotAction для игры ${gameId}`);
    
    // Немедленный запуск без проверок
    setImmediate(async () => {
      try {
        await processBotAction(gameId);
  } catch (error) {
        console.error('[FORCE-BOT] Ошибка при принудительном запуске бота:', error);
      }
    });
    
    res.json({ message: 'Принудительный запуск бота выполнен', gameId, botIndex });
    
  } catch (error) {
    console.error('[FORCE-BOT] Ошибка:', error);
    res.status(500).json({ message: 'Ошибка сервера', error: error.message });
  }
});

/**
 * @route   POST /api/poker/:gameId/status
 * @desc    Изменение статуса игры (например, выход игрока)
 * @access  Public
 */
router.post('/:gameId/status', async (req, res) => {
  console.log('==================== ВХОД В STATUS ROUTE ====================');
  console.log('Параметры:', req.params);
  console.log('Тело запроса:', req.body);
  try {
    const { gameId } = req.params;
    const { userId, status } = req.body;
    
    console.log(`[STATUS] Изменение статуса игры ${gameId} пользователем ${userId} на ${status}`);
    
    let game = await PokerGame.findByPk(gameId);
    if (!game) {
      return res.status(404).json({ message: 'Игра не найдена' });
    }
    
    // Находим игрока
    const playerIndex = game.players.findIndex(p => {
      // ИСПРАВЛЕНО: Ищем игрока по user ID или username
      if (p.user !== null && p.user !== undefined) {
        const playerUserId = p.user.toString();
        const requestUserId = userId.toString();
        if (playerUserId === requestUserId) {
          return true;
        }
      }
      
      // ДОБАВЛЕНО: Дополнительная проверка по username для реальных игроков
      if (!p.isBot && p.username && p.username.toString() === userId.toString()) {
        return true;
      }
      
      return false;
    });
    
    if (playerIndex === -1) {
      console.log(`[STATUS] Игрок не найден. userId: ${userId}, players:`, game.players.map(p => ({ user: p.user, username: p.username, isBot: p.isBot })));
      return res.status(400).json({ message: 'Игрок не найден в игре' });
    }
    
    // Обрабатываем различные статусы
    switch (status) {
      case 'finished':
        // Игрок покидает игру
        game.players[playerIndex].folded = true;
        
        // Если остался только один активный игрок - завершаем игру
        const activePlayers = game.players.filter(p => !p.folded);
        if (activePlayers.length === 1) {
          const winner = activePlayers[0];
          winner.chips += game.pot;
          game.winner = winner.username;
          game.status = 'finished';
          console.log(`[STATUS] Игра завершена, победитель: ${game.winner}`);
        }
        
        // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Явно помечаем JSON поля как измененные для Sequelize

        
        game.changed('players', true);

        
        game.changed('pot', true);

        
        game.changed('settings', true);

        
        

        
        await game.save();
        console.log(`[STATUS] Игрок ${game.players[playerIndex].username} покинул игру`);
        break;
        
      default:
        return res.status(400).json({ message: 'Неизвестный статус' });
    }
    
    res.json({ message: 'Статус обновлен', game });
    
  } catch (error) {
    console.error('Ошибка при изменении статуса игры:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * @route   POST /api/poker/:gameId/next-game
 * @desc    Запуск следующей игры с новой раздачей
 * @access  Public
 */
router.post('/:gameId/next-game', async (req, res) => {
  console.log('==================== ВХОД В NEXT-GAME ROUTE ====================');
  console.log('Параметры:', req.params);
  console.log('Тело запроса:', req.body);
  try {
    const { gameId } = req.params;
    
    console.log(`[NEXT-GAME] Запуск следующей игры для ${gameId}`);
    
    let game = await PokerGame.findByPk(gameId);
    if (!game) {
      console.log(`[NEXT-GAME] Игра не найдена: ${gameId}`);
      return res.status(404).json({ message: 'Игра не найдена' });
    }
    
    console.log(`[NEXT-GAME] Текущий статус игры: ${game.status}`);
    console.log(`[NEXT-GAME] Победитель: ${game.winner}`);
    
    if (game.status !== 'finished') {
      console.log(`[NEXT-GAME] Игра не завершена, статус: ${game.status}`);
      return res.status(400).json({ message: `Текущая игра еще не завершена. Статус: ${game.status}` });
    }
    
    // Переходим к следующей игре
    console.log(`[NEXT-GAME] Запускаем startNextGame...`);
    const result = await startNextGame(game);
    
    // ИСПРАВЛЕНО: Проверяем результат startNextGame
    if (!result) {
      console.log(`[NEXT-GAME] Недостаточно игроков для следующей игры`);
      return res.status(400).json({ 
        message: 'Недостаточно игроков с фишками для продолжения',
        canContinue: false
      });
    }
    
    console.log(`[NEXT-GAME] Новый статус игры: ${result.status}`);
    console.log(`[NEXT-GAME] ID новой игры: ${result.id}`);
    
    // ИСПРАВЛЕНО: Возвращаем правильную структуру с .id вместо ._id
    res.json({ 
      message: 'Следующая игра запущена',
      gameId: result.id,
      currentTurn: result.settings.currentTurn,
      success: true
    });
    
  } catch (error) {
    console.error('[NEXT-GAME] Ошибка при запуске следующей игры:', error);
    res.status(500).json({ message: 'Ошибка сервера', error: error.message });
  }
});

// Функция для автоматического запуска следующей игры
async function startNextGame(game) {
  try {
    console.log('[NEXT-GAME] ============= НАЧАЛО СЛЕДУЮЩЕЙ ИГРЫ =============');
    console.log(`[NEXT-GAME] Game ID: ${game.id}`);
    console.log(`[NEXT-GAME] Текущий статус игры: ${game.status}`);
    
    // Проверяем, что у всех игроков есть фишки для продолжения
    const playersWithChips = game.players.filter(player => player.chips >= 20); // Минимум для большого блайнда
    
    console.log(`[NEXT-GAME] Игроки с достаточными фишками: ${playersWithChips.length}`);
    playersWithChips.forEach((player, index) => {
      console.log(`[NEXT-GAME] Игрок ${index}: ${player.username} - ${player.chips} фишек`);
    });
    
    if (playersWithChips.length < 2) {
      console.log('[NEXT-GAME] Недостаточно игроков с фишками для продолжения');
      
      // Обновляем только статус старой игры
      game.status = 'eliminated';
      game.winner = playersWithChips.length > 0 ? playersWithChips[0].username : 'Никто';
      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Явно помечаем JSON поля как измененные для Sequelize
      game.changed('players', true);
      game.changed('pot', true);
      game.changed('settings', true);
      
      await game.save();
      return null; // ИСПРАВЛЕНО: Возвращаем null когда недостаточно игроков
    }
    
    // Сдвигаем дилера на следующую позицию (по часовой стрелке)
    let newDealerPosition = (game.settings.dealerPosition + 1) % game.players.length;
    
    // Пропускаем игроков без фишек
    let attempts = 0;
    while (game.players[newDealerPosition].chips < 20 && attempts < game.players.length) {
      newDealerPosition = (newDealerPosition + 1) % game.players.length;
      attempts++;
    }
    
    console.log(`[NEXT-GAME] Новый дилер: позиция ${newDealerPosition}`);
    
    // Создаем массив игроков для новой игры на основе текущих
    const newPlayers = game.players.map((player, index) => ({
      user: player.user || null,
      username: player.username,
      chips: player.chips,
      cards: [],
      position: index,
      currentBet: 0,
      isBot: player.isBot,
      isDealer: index === newDealerPosition,
      isSmallBlind: index === ((newDealerPosition + 1) % game.players.length),
      isBigBlind: index === ((newDealerPosition + 2) % game.players.length),
      isUTG: index === ((newDealerPosition + 3) % game.players.length),
      folded: false,
      isAllIn: false,
      hasActed: false
    }));
    
    const sbPosition = (newDealerPosition + 1) % game.players.length;
    const bbPosition = (newDealerPosition + 2) % game.players.length;
    const utgPosition = (newDealerPosition + 3) % game.players.length;
    
    console.log(`[NEXT-GAME] Позиции: Дилер=${newDealerPosition}, SB=${sbPosition}, BB=${bbPosition}, UTG=${utgPosition}`);
    
    // Снимаем блайнды
    const smallBlind = game.settings.smallBlind || 10;
    const bigBlind = game.settings.bigBlind || 20;
    
    // Проверяем, что у игроков достаточно фишек для блайндов
    if (newPlayers[sbPosition].chips >= smallBlind) {
      newPlayers[sbPosition].chips -= smallBlind;
      newPlayers[sbPosition].currentBet = smallBlind;
    } else {
      // All-in на оставшиеся фишки
      newPlayers[sbPosition].currentBet = newPlayers[sbPosition].chips;
      newPlayers[sbPosition].chips = 0;
      newPlayers[sbPosition].isAllIn = true;
    }
    
    if (newPlayers[bbPosition].chips >= bigBlind) {
      newPlayers[bbPosition].chips -= bigBlind;
      newPlayers[bbPosition].currentBet = bigBlind;
    } else {
      // All-in на оставшиеся фишки
      newPlayers[bbPosition].currentBet = newPlayers[bbPosition].chips;
      newPlayers[bbPosition].chips = 0;
      newPlayers[bbPosition].isAllIn = true;
    }
    
    // ИСПРАВЛЕНО: Создаем НОВУЮ игру вместо изменения старой
    const newGameData = {
      type: 'poker',
      players: newPlayers,
      pot: newPlayers[sbPosition].currentBet + newPlayers[bbPosition].currentBet,
      deck: createDeck(),
      status: 'playing',
      settings: {
        ...game.settings,
        currentTurn: utgPosition,
        currentRound: 'preflop',
        dealerPosition: newDealerPosition,
        communityCards: []
      },
      winner: null,
      showdown: false,
      user_id: game.user_id
    };
    
    console.log(`[NEXT-GAME] Банк после блайндов: ${newGameData.pot}`);
    
    // Создаем новую игру
    const newGame = await PokerGame.create(newGameData);
    
    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Логируем ID сразу после создания
    console.log(`[NEXT-GAME] ✅ НОВАЯ ИГРА СОЗДАНА В БД с ID: ${newGame.id}`);
    console.log(`[NEXT-GAME] Тип ID: ${typeof newGame.id}`);
    console.log(`[NEXT-GAME] ID как строка: "${newGame.id}"`);
    
    // Раздаем новые карты
    dealCards(newGame);
    
    console.log('[NEXT-GAME] Карты розданы, игра началась');
    console.log(`[NEXT-GAME] Первый ход: игрок ${newGame.settings.currentTurn} (${newGame.players[newGame.settings.currentTurn].username})`);
    
    // Сохраняем новую игру с картами
    newGame.changed('deck', true);
    newGame.changed('players', true);
    await newGame.save();
    
    // ИСПРАВЛЕНО: Обновляем старую игру ссылкой на новую
    game.status = 'replaced';
    game.nextGameId = newGame.id;
    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Явно помечаем JSON поля как измененные для Sequelize
    game.changed('players', true);
    game.changed('pot', true);
    game.changed('settings', true);
    
    await game.save();
    
    console.log(`[NEXT-GAME] ============= СЛЕДУЮЩАЯ ИГРА ЗАПУЩЕНА =============`);
    console.log(`[NEXT-GAME] Новый статус игры: ${newGame.status}`);
    console.log(`[NEXT-GAME] ID новой игры: ${newGame.id}`);
    
    // ИСПРАВЛЕНО: более надежный запуск ботов если первый ход у бота
    const newGameCurrentTurn = newGame.settings.currentTurn;
    if (newGame.players[newGameCurrentTurn] && newGame.players[newGameCurrentTurn].isBot && !newGame.players[newGameCurrentTurn].folded) {
      console.log(`[NEXT-GAME] Запускаем первого бота ${newGame.players[newGameCurrentTurn].username}`);
      
      const gameId = newGame.id.toString();
      setTimeout(async () => {
        try {
          console.log(`[NEXT-GAME] ⚡ ВЫПОЛНЯЕМ processBotAction для следующей игры ${gameId}`);
          
          // Проверяем что первый игрок действительно бот и должен ходить
          const freshGame = await PokerGame.findByPk(gameId);
          const freshCurrentTurn = freshGame.settings.currentTurn;
          if (freshGame && 
              freshGame.status === 'playing' && 
              freshGame.players[freshCurrentTurn] && 
              freshGame.players[freshCurrentTurn].isBot &&
              !freshGame.players[freshCurrentTurn].folded &&
              !freshGame.players[freshCurrentTurn].hasActed) {
            
            console.log(`[NEXT-GAME] ✅ Все условия выполнены, запускаем бота ${freshGame.players[freshCurrentTurn].username}`);
            await processBotAction(gameId);
          } else {
            console.log(`[NEXT-GAME] ❌ Условия для запуска бота не выполнены`);
          }
        } catch (error) {
          console.error('[NEXT-GAME] ❌ Ошибка при запуске бота в следующей игре:', error);
        }
      }, 4000); // ИЗМЕНЕНО: увеличил с 1000 до 4000ms (4 секунды)
    }
    
    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Возвращаем объект с правильной структурой
    return {
      id: newGame.id,
      status: newGame.status,
      settings: newGame.settings,
      players: newGame.players,
      pot: newGame.pot
    };
    
  } catch (error) {
    console.error('[NEXT-GAME] Ошибка при запуске следующей игры:', error);
    throw error;
  }
}

// Обновляем логику завершения игры в processBotAction
async function processBotAction(gameId) {
  try {
    console.log(`[BOT-ACTION] ================ ЗАПУСК БОТА для ${gameId} ================`);
    
    if (processingGames.has(gameId.toString())) {
      console.log(`[BOT-ACTION] Игра ${gameId} уже обрабатывается, пропускаем`);
      return;
    }
    
    processingGames.add(gameId.toString());
    
    // ИСПРАВЛЕНО: принудительная перезагрузка из базы для актуального состояния
    console.log(`[BOT-ACTION] ===== ДЕТАЛЬНАЯ ИНФОРМАЦИЯ ОБ ИГРЕ =====`);
    console.log(`[BOT-ACTION] Загруженная игра ID: ${gameId}`);
    console.log(`[BOT-ACTION] Запрошенная игра ID: ${gameId}`);
    console.log(`[BOT-ACTION] ID совпадают: ${gameId.toString() === gameId.toString()}`);
    
    const game = await PokerGame.findByPk(gameId);
    console.log(`[BOT-ACTION] *** ПОСЛЕ ПРИНУДИТЕЛЬНОЙ ПЕРЕЗАГРУЗКИ currentTurn: ${game.settings.currentTurn} ***`);
    console.log(`[BOT-ACTION] game.settings.currentTurn из базы: ${game.settings.currentTurn}`);
    
    if (!game || game.status !== 'playing') {
      console.log(`[BOT-ACTION] Игра не найдена или уже завершена: статус ${game?.status}`);
      processingGames.delete(gameId.toString());
      return;
    }

    const currentPlayerIndex = game.settings.currentTurn;
    const currentPlayer = game.players[currentPlayerIndex];
    console.log(`[BOT-ACTION] currentPlayerIndex: ${currentPlayerIndex}`);
    console.log(`[BOT-ACTION] Проверяем игрока на позиции ${currentPlayerIndex}: ${currentPlayer.username}`);
    console.log(`[BOT-ACTION] isBot: ${currentPlayer.isBot}, folded: ${currentPlayer.folded}, hasActed: ${currentPlayer.hasActed}`);

    if (!currentPlayer.isBot || currentPlayer.folded || currentPlayer.hasActed) {
      console.log(`[BOT-ACTION] Игрок ${currentPlayer.username} не подходит для бота или уже действовал`);
      processingGames.delete(gameId.toString());
      return;
    }

    // Определяем действие бота
    const botAction = getBotAction(game, currentPlayerIndex);
    console.log(`[BOT-ACTION] Бот ${currentPlayer.username} (позиция ${currentPlayerIndex}) делает ход`);
    console.log(`[BOT-ACTION] Фишки: ${currentPlayer.chips}, ставка: ${currentPlayer.currentBet}`);
    console.log(`[BOT-ACTION] Бот ${currentPlayer.username} выбрал: ${botAction.action}${botAction.amount ? ' ' + botAction.amount : ''}`);

    // Применяем действие
    const currentBet = Math.max(...game.players.map(p => p.currentBet));
    const botPlayer = game.players[currentPlayerIndex];

    console.log(`[BOT-ACTION] ===== ПРИМЕНЕНИЕ ДЕЙСТВИЯ БОТА =====`);
    console.log(`[BOT-ACTION] ДО изменения: folded=${botPlayer.folded}, hasActed=${botPlayer.hasActed}, bet=${botPlayer.currentBet}`);

    switch (botAction.action) {
      case 'fold':
        botPlayer.folded = true;
        botPlayer.hasActed = true;
        console.log(`[BOT-ACTION] Применил fold: folded=${botPlayer.folded}, hasActed=${botPlayer.hasActed}`);
        break;
      
      case 'call':
        const callAmount = currentBet - botPlayer.currentBet;
        if (botPlayer.chips >= callAmount) {
          botPlayer.chips -= callAmount;
          botPlayer.currentBet += callAmount;
          game.pot += callAmount;
          botPlayer.hasActed = true;
          console.log(`[BOT-ACTION] Применил call: chips=${botPlayer.chips}, bet=${botPlayer.currentBet}, hasActed=${botPlayer.hasActed}`);
        }
        break;
      
      case 'bet':
      case 'raise':
        const betAmount = botAction.amount;
        if (botPlayer.chips >= betAmount) {
          const totalBetAmount = betAmount - botPlayer.currentBet;
          botPlayer.chips -= totalBetAmount;
          game.pot += totalBetAmount;
          botPlayer.currentBet = betAmount;
          botPlayer.hasActed = true;
          
          // ИСПРАВЛЕНО: сбрасываем hasActed только у НЕ сфолженных игроков при рейзе
          game.players.forEach((p, idx) => {
            if (idx !== currentPlayerIndex && !p.folded) {
            p.hasActed = false;
          }
        });
          console.log(`[BOT-ACTION] Применил bet/raise: chips=${botPlayer.chips}, bet=${botPlayer.currentBet}, hasActed=${botPlayer.hasActed}`);
        }
        break;
        
      case 'check':
        if (botPlayer.currentBet === currentBet) {
          botPlayer.hasActed = true;
          console.log(`[BOT-ACTION] Применил check: hasActed=${botPlayer.hasActed}`);
        }
        break;
    }

    console.log(`[BOT-ACTION] ПОСЛЕ изменения: folded=${botPlayer.folded}, hasActed=${botPlayer.hasActed}, bet=${botPlayer.currentBet}`);
    console.log(`[BOT-ACTION] ==========================================`);

    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Сохраняем состояние в базу СРАЗУ после действия
    console.log(`[BOT-ACTION] 💾 СОХРАНЕНИЕ ИЗМЕНЕНИЙ В БАЗУ...`);
    console.log(`[BOT-ACTION] Игрок ${currentPlayerIndex} (${botPlayer.username}): folded=${botPlayer.folded}, hasActed=${botPlayer.hasActed}, bet=${botPlayer.currentBet}`);
    
    // ИСПРАВЛЕНО: используем Sequelize save вместо findByIdAndUpdate
    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Явно помечаем JSON поля как измененные для Sequelize

    game.changed('players', true);

    game.changed('pot', true);

    game.changed('settings', true);

    

    await game.save();
    
    // НОВОЕ КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Принудительно перезагружаем из базы ДЛЯ АКТУАЛЬНЫХ ДАННЫХ
    console.log(`[BOT-ACTION] 🔄 ПРИНУДИТЕЛЬНАЯ ПЕРЕЗАГРУЗКА ПОСЛЕ СОХРАНЕНИЯ...`);
    const freshGame = await PokerGame.findByPk(gameId);
    console.log(`[BOT-ACTION] ✅ Перезагружено из базы. ID игры: ${freshGame.id}`);
    
    // ДОБАВЛЕНО: проверяем что сохранение прошло успешно
    console.log(`[BOT-ACTION] 🔍 ПРОВЕРКА СОХРАНЕНИЯ: игрок ${currentPlayerIndex} hasActed=${freshGame.players[currentPlayerIndex].hasActed}, folded=${freshGame.players[currentPlayerIndex].folded}, bet=${freshGame.players[currentPlayerIndex].currentBet}`);

    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Используем СВЕЖИЕ данные из базы для расчетов
    const activePlayers = freshGame.players.filter(p => !p.folded);
    console.log(`[BOT-ACTION] Активных игроков ПОСЛЕ действия: ${activePlayers.length}`);
    activePlayers.forEach((p, idx) => {
      console.log(`[BOT-ACTION] Активный игрок ${idx}: ${p.username}, folded: ${p.folded}, hasActed: ${p.hasActed}`);
    });
    
    // ДОБАВЛЕНО: детальное логирование состояния всех игроков после действия бота
    console.log(`[BOT-ACTION] ===== СОСТОЯНИЕ ВСЕХ ИГРОКОВ ПОСЛЕ ДЕЙСТВИЯ БОТА =====`);
    freshGame.players.forEach((p, idx) => {
      console.log(`[BOT-ACTION] Игрок ${idx}: ${p.username}, folded: ${p.folded}, hasActed: ${p.hasActed}, bet: ${p.currentBet}`);
    });
    console.log(`[BOT-ACTION] ========================================================`);

    // ИСПРАВЛЕНО: правильная проверка игроков ожидающих хода
    const playersToAct = activePlayers.filter(p => !p.hasActed);
    
    // ДОБАВЛЕНО: проверяем также что все активные игроки имеют одинаковую ставку (кроме all-in)
    const maxBet = Math.max(...activePlayers.map(p => p.currentBet));
    const playersNeedToMatchBet = activePlayers.filter(p => 
      p.currentBet < maxBet && !p.isAllIn && !p.hasActed);
    
    console.log(`[BOT-ACTION] Игроков ожидают хода: ${playersToAct.length}`);
    console.log(`[BOT-ACTION] Игроков нужно доставить ставку: ${playersNeedToMatchBet.length}`);
    
    // ДОБАВЛЕНО: детальное логирование для отладки перехода к раундам
    console.log(`[BOT-ACTION] ===== АНАЛИЗ ПЕРЕХОДА К РАУНДУ =====`);
    console.log(`[BOT-ACTION] maxBet: ${maxBet}`);
    console.log(`[BOT-ACTION] Все активные игроки:`);
    activePlayers.forEach((p, idx) => {
      console.log(`[BOT-ACTION] - ${p.username}: hasActed=${p.hasActed}, bet=${p.currentBet}, needsBet=${p.currentBet < maxBet && !p.hasActed}`);
    });
    console.log(`[BOT-ACTION] Условие для перехода: playersToAct=${playersToAct.length} == 0 && playersNeedToMatchBet=${playersNeedToMatchBet.length} == 0`);
    console.log(`[BOT-ACTION] =======================================`);

    playersToAct.forEach((p, idx) => {
      console.log(`[BOT-ACTION] Ожидает хода ${idx}: ${p.username}, currentBet: ${p.currentBet}, folded: ${p.folded}`);
    });

    // ДОБАВЛЕНО: проверяем если остался только один активный игрок
    if (activePlayers.length === 1) {
      // Только один игрок остался - он победитель и получает банк (НЕ шоудаун)
      const winner = activePlayers[0];
      const winnerIndex = freshGame.players.findIndex(p => p.username === winner.username);
      
      freshGame.players[winnerIndex].chips += freshGame.pot;
      freshGame.pot = 0;
      freshGame.status = 'finished';
      freshGame.winner = winner.username;
      freshGame.winningHand = 'Все остальные сбросили карты';
      freshGame.showdown = false;
      
      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Явно помечаем JSON поля как измененные для Sequelize
      freshGame.changed('players', true);
      freshGame.changed('pot', true);
      freshGame.changed('settings', true);
      
      await freshGame.save();
      
      console.log(`[BOT-ACTION] 🏆 Только один игрок остался: ${winner.username}, игра завершена`);
      processingGames.delete(gameId.toString());
      
      // Запускаем следующую игру через 3 секунды
      setTimeout(() => {
        startNextGame(freshGame);
      }, 3000);
      
      return;
    }

    // ИСПРАВЛЕНО: Проверяем переход к следующему раунду только если все активные игроки сделали ход И имеют равные ставки
    if (playersToAct.length === 0 && playersNeedToMatchBet.length === 0) {
      console.log(`[BOT-ACTION] 🎯 Все завершили действия, переходим к следующему раунду`);
      await advanceToNextRound(freshGame);
      processingGames.delete(gameId.toString());
      return;
    }

    // ИСПРАВЛЕНО: Находим следующего игрока используя свежие данные
    let nextPlayerIndex = (currentPlayerIndex + 1) % freshGame.players.length;
    let attempts = 0;
    
    // ИСПРАВЛЕНО: ищем игрока который не сбросил карты И (не сделал ход ИЛИ нужно доставить ставку)
    while (attempts < freshGame.players.length) {
      const nextPlayer = freshGame.players[nextPlayerIndex];
      
      // Игрок подходит если:
      // 1. Не сбросил карты И
      // 2. (Не сделал ход ИЛИ его ставка меньше максимальной)
      if (!nextPlayer.folded && 
          (!nextPlayer.hasActed || nextPlayer.currentBet < maxBet)) {
        break;
      }
      
      nextPlayerIndex = (nextPlayerIndex + 1) % freshGame.players.length;
      attempts++;
    }

    if (attempts >= freshGame.players.length) {
      console.log(`[BOT-ACTION] ❌ Не найден следующий игрок, завершаем обработку`);
      processingGames.delete(gameId.toString());
      return;
    }

    freshGame.settings.currentTurn = nextPlayerIndex;
    
    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Явно помечаем JSON поля как измененные для Sequelize
    freshGame.changed('players', true);
    freshGame.changed('pot', true);
    freshGame.changed('settings', true);
    
    await freshGame.save();
    
    console.log(`[BOT-ACTION] ⏭️ Ход переходит к игроку ${nextPlayerIndex}: ${freshGame.players[nextPlayerIndex].username}`);

    // ИСПРАВЛЕНО: запускаем следующего бота если он есть
    if (freshGame.players[nextPlayerIndex].isBot && !freshGame.players[nextPlayerIndex].folded && !freshGame.players[nextPlayerIndex].hasActed) {
      console.log(`[BOT-ACTION] 🤖 Следующий игрок тоже бот, запускаем его через 1 секунду`);
      setTimeout(async () => {
        processingGames.delete(gameId.toString());
        await processBotAction(gameId);
      }, 1000);
    } else {
      console.log(`[BOT-ACTION] ⏹️ Следующий игрок не бот или уже действовал, остановка обработки`);
      processingGames.delete(gameId.toString());
    }

  } catch (error) {
    console.error('[BOT-ACTION] Ошибка при выполнении действия бота:', error);
    processingGames.delete(gameId.toString());
  }
}

// ДОБАВЛЕНО: функция для определения действия бота
function getBotAction(game, playerIndex) {
  const player = game.players[playerIndex];
  const currentBet = Math.max(...game.players.map(p => p.currentBet));
  const callAmount = currentBet - player.currentBet;
  
  const random = Math.random();
  
  // Улучшенная логика бота - более агрессивная игра
  if (callAmount === 0) {
    // Можно чекнуть - боты стали более агрессивными
    if (random < 0.4) {
      return { action: 'check' };
    } else if (random < 0.8 && player.chips >= 20) {
      return { action: 'bet', amount: currentBet + 20 };
    } else if (random < 0.95 && player.chips >= 40) {
      // Большой рейз для разнообразия
      return { action: 'bet', amount: currentBet + 40 };
    } else {
      return { action: 'check' }; // Вместо fold делаем check
    }
  } else {
    // Есть ставка для уравнения - значительно снижаем вероятность fold
    if (random < 0.15) { // УМЕНЬШЕНО с 0.4 до 0.15 - fold только в 15% случаев
      return { action: 'fold' };
    } else if (random < 0.65 && player.chips >= callAmount) { // УВЕЛИЧЕНО с 0.8 до 0.65
      return { action: 'call' };
    } else if (random < 0.85 && player.chips >= (callAmount + 20)) { // УВЕЛИЧЕНО с 0.9 до 0.85
      return { action: 'raise', amount: currentBet + 20 };
    } else if (random < 0.95 && player.chips >= (callAmount + 40)) {
      // Агрессивный рейз
      return { action: 'raise', amount: currentBet + 40 };
    } else if (player.chips >= callAmount) {
      return { action: 'call' }; // Если не можем рейзить - хотя бы коллируем
    } else {
      return { action: 'fold' };
    }
  }
}

// ДОБАВЛЕНО: функция для перехода к следующему раунду
async function advanceToNextRound(game) {
  console.log(`[ROUND] ====== ПЕРЕХОД К СЛЕДУЮЩЕМУ РАУНДУ ======`);
  console.log(`[ROUND] Текущий раунд: ${game.settings.currentRound}`);
  
  // Проверяем есть ли больше одного активного игрока
  const activePlayers = game.players.filter(p => !p.folded);
  if (activePlayers.length === 1) {
    // Только один игрок остался - он победитель (НЕ шоудаун)
    const winner = activePlayers[0];
    winner.chips += game.pot;
    game.winner = winner.username;
    game.status = 'finished';
    game.showdown = false; // ДОБАВЛЕНО: НЕ шоудаун - карты не показываем
    console.log(`[ROUND] Игра завершена БЕЗ шоудауна! Победитель: ${game.winner}, получил ${game.pot} фишек`);
    
    // ДОБАВЛЕНО: сохраняем изменения в базу данных
    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Явно помечаем поля как измененные
    game.changed('players', true);
    game.changed('pot', true);
    game.changed('settings', true);
    await game.save();
    console.log(`[ROUND] Игра сохранена в базу с победителем ${game.winner}`);
    return;
  }

  // ИСПРАВЛЕНИЕ: Сбрасываем hasActed у всех активных игроков для нового раунда
  console.log(`[ROUND] 🔄 СБРОС hasActed для нового раунда`);
  game.players.forEach((player, index) => {
    if (!player.folded) {
      console.log(`[ROUND] Сбрасываем hasActed для игрока ${index}: ${player.username}`);
      player.hasActed = false;
    }
  });

  // Переходим к следующему раунду с защитой от дублирования карт
  if (game.settings.currentRound === 'preflop') {
    game.settings.currentRound = 'flop';
    const { dealCommunityCards } = require('../utils/pokerUtils');
    
    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Инициализируем communityCards если не существует
    if (!game.settings.communityCards) {
      game.settings.communityCards = [];
    }
    
    // ДОБАВЛЕНО: Проверяем что флоп еще не выложен
    if (game.settings.communityCards.length === 0) {
      console.log(`[CARDS] Осталось в колоде ДО выдачи: ${game.deck.length}`);
      const communityCards = dealCommunityCards(game.deck, 3, game);
      game.settings.communityCards.push(...communityCards);
      console.log(`[CARDS] Выдано ${communityCards.length} общих карт: ${communityCards.map(c => `${c.value} ${c.suit}`).join(', ')}`);
      console.log(`[CARDS] Осталось в колоде ПОСЛЕ выдачи: ${game.deck.length}`);
      console.log(`[ROUND] Переход к флопу, выложено ${communityCards.length} карт:`, 
                  communityCards.map(c => `${c.value} ${c.suit}`).join(', '));
      
      // ДОБАВЛЕНО: Проверяем карты после выдачи флопа
      const { validateGameCards } = require('../utils/pokerUtils');
      const flopValidation = validateGameCards(game);
      if (!flopValidation.isValid) {
        console.error(`[ROUND] ❌ ОШИБКА после выдачи флопа:`, flopValidation.errors);
      }
      
      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Сохраняем изменения в колоде после выдачи флопа
      game.changed('deck', true);
      game.changed('settings', true);
      await game.save();
    } else {
      console.log(`[ROUND] ❌ ФЛОП УЖЕ ВЫЛОЖЕН (${game.settings.communityCards.length} карт), пропускаем выдачу`);
    }
    
  } else if (game.settings.currentRound === 'flop') {
    game.settings.currentRound = 'turn';
    const { dealCommunityCards } = require('../utils/pokerUtils');
    
    // ДОБАВЛЕНО: Проверяем что терн еще не выложен
    if (game.settings.communityCards.length === 3) {
      const turnCard = dealCommunityCards(game.deck, 1, game);
      game.settings.communityCards.push(...turnCard);
      console.log(`[ROUND] Переход к терну, выложена ${turnCard.length} карта:`, 
                  turnCard.map(c => `${c.value} ${c.suit}`).join(', '));
      
      // ДОБАВЛЕНО: Проверяем карты после выдачи терна
      const { validateGameCards } = require('../utils/pokerUtils');
      const turnValidation = validateGameCards(game);
      if (!turnValidation.isValid) {
        console.error(`[ROUND] ❌ ОШИБКА после выдачи терна:`, turnValidation.errors);
      }
      
      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Сохраняем изменения в колоде после выдачи терна
      game.changed('deck', true);
      game.changed('settings', true);
      await game.save();
    } else {
      console.log(`[ROUND] ❌ ТЕРН УЖЕ ВЫЛОЖЕН (${game.settings.communityCards.length} карт), пропускаем выдачу`);
    }
    
  } else if (game.settings.currentRound === 'turn') {
    game.settings.currentRound = 'river';
    const { dealCommunityCards } = require('../utils/pokerUtils');
    
    // ДОБАВЛЕНО: Проверяем что ривер еще не выложен  
    if (game.settings.communityCards.length === 4) {
      const riverCard = dealCommunityCards(game.deck, 1, game);
      game.settings.communityCards.push(...riverCard);
      console.log(`[ROUND] Переход к риверу, выложена ${riverCard.length} карта:`, 
                  riverCard.map(c => `${c.value} ${c.suit}`).join(', '));
      
      // ДОБАВЛЕНО: Проверяем карты после выдачи ривера
      const { validateGameCards } = require('../utils/pokerUtils');
      const riverValidation = validateGameCards(game);
      if (!riverValidation.isValid) {
        console.error(`[ROUND] ❌ ОШИБКА после выдачи ривера:`, riverValidation.errors);
      }
      
      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Сохраняем изменения в колоде после выдачи ривера
      game.changed('deck', true);
      game.changed('settings', true);
      await game.save();
    } else {
      console.log(`[ROUND] ❌ РИВЕР УЖЕ ВЫЛОЖЕН (${game.settings.communityCards.length} карт), пропускаем выдачу`);
    }
    
  } else if (game.settings.currentRound === 'river') {
    // ИСПРАВЛЕНИЕ: Шоудаун - определяем победителя и завершаем игру
    console.log(`[ROUND] Переход к шоудауну`);
    
    // ДОБАВЛЕНО: Финальная проверка карт перед шоудауном
    const { determineWinner, validateGameCards } = require('../utils/pokerUtils');
    
    console.log(`[ROUND] 🔍 Финальная проверка карт перед шоудауном...`);
    const cardsValidation = validateGameCards(game);
    if (!cardsValidation.isValid) {
      console.error(`[ROUND] ❌ КРИТИЧЕСКАЯ ОШИБКА: Дубликаты карт обнаружены перед шоудауном!`, cardsValidation.errors);
      // Можно принять решение о том, что делать - перечитать игру или завершить с ошибкой
    }
    
    // ИСПРАВЛЕНИЕ: determineWinner уже обновляет игру напрямую
    determineWinner(game); // Эта функция обновляет game напрямую
    
    game.status = 'finished';
    game.showdown = true;
    console.log(`[ROUND] Победитель шоудауна: ${game.winner} с комбинацией ${game.winningHand}`);
    
    // Сохраняем и завершаем
    game.changed('players', true);
    game.changed('pot', true);
    game.changed('settings', true);
    await game.save();
    console.log(`[ROUND] Игра завершена шоудауном`);
    return;
  }

  // ИСПРАВЛЕНИЕ: Находим первого активного игрока после дилера для нового раунда
  const dealerPosition = game.settings.dealerPosition;
  console.log(`[ROUND] Позиция дилера: ${dealerPosition}`);
  
  // Ищем первого активного игрока слева от дилера
  let firstPlayerPosition = -1;
  for (let i = 1; i <= game.players.length; i++) {
    const pos = (dealerPosition + i) % game.players.length;
    if (!game.players[pos].folded) {
      firstPlayerPosition = pos;
      break;
    }
  }
  
  if (firstPlayerPosition === -1) {
    console.log(`[ROUND] ❌ Не найден активный игрок для нового раунда`);
    return;
  }
  
  game.settings.currentTurn = firstPlayerPosition;
  console.log(`[ROUND] Новый раунд ${game.settings.currentRound}, ход игрока ${firstPlayerPosition} (${game.players[firstPlayerPosition].username})`);

  // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Явно помечаем поля как измененные
  game.changed('players', true);
  game.changed('pot', true);
  game.changed('settings', true);
  game.changed('deck', true); // ДОБАВЛЕНО: Сохраняем изменения в колоде
  await game.save();
  
  // ИСПРАВЛЕНИЕ: Запускаем первого игрока нового раунда если это бот
  const currentPlayer = game.players[game.settings.currentTurn];
  if (currentPlayer && currentPlayer.isBot && !currentPlayer.folded && !currentPlayer.hasActed) {
    console.log(`[ROUND] 🤖 Первый игрок нового раунда ${currentPlayer.username} - бот, запускаем его`);
    
    // Запускаем с задержкой
    setTimeout(async () => {
      try {
        await processBotAction(game.id);
      } catch (error) {
        console.error('[ROUND] Ошибка при запуске бота:', error);
      }
    }, 1000);
  } else {
    console.log(`[ROUND] Первый игрок нового раунда: ${currentPlayer?.username} (isBot: ${currentPlayer?.isBot})`);
  }
}

/**
 * @route   POST /api/poker/:gameId/fold
 * @desc    Сброс карт (fold)
 * @access  Public
 */
router.post('/:gameId/fold', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { userId } = req.body;
    
    console.log('[FOLD] ================ ПОПЫТКА FOLD ================');
    console.log(`[FOLD] GameID: ${gameId}, UserID: ${userId}`);
    
    let game = await PokerGame.findByPk(gameId);
    if (!game) {
      return res.status(404).json({ message: 'Игра не найдена' });
    }
    
    if (game.status !== 'playing') {
      return res.status(400).json({ message: 'Игра не активна' });
    }
    
    const playerIndex = game.players.findIndex(p => p.user == userId);
    if (playerIndex === -1) {
      return res.status(404).json({ message: 'Игрок не найден в игре' });
    }
    
    if (game.currentTurn !== playerIndex) {
      return res.status(400).json({ message: 'Не ваш ход' });
    }
    
    const player = game.players[playerIndex];
    
    if (player.folded) {
      return res.status(400).json({ message: 'Игрок уже сбросил карты' });
    }
    
    // Обновляем данные игрока
    player.folded = true;
    player.hasActed = true;
    
    console.log(`[FOLD] Игрок ${player.username} сбросил карты`);
    
    // Проверяем, остался ли только один активный игрок
    const activePlayers = game.players.filter(p => !p.folded);
    console.log(`[FOLD] Активных игроков: ${activePlayers.length}`);
    
    if (activePlayers.length === 1) {
      // Игра заканчивается, единственный оставшийся игрок выигрывает
      const winner = activePlayers[0];
      const winnerIndex = game.players.findIndex(p => p.username === winner.username);
      
      game.players[winnerIndex].chips += game.pot;
      game.pot = 0;
      game.status = 'finished';
      game.winner = winner.username;
      game.winningHand = 'Все остальные сбросили карты';
      
      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Явно помечаем JSON поля как измененные для Sequelize

      
      game.changed('players', true);

      
      game.changed('pot', true);

      
      game.changed('settings', true);

      
      

      
      await game.save();
      
      console.log(`[FOLD] 🏆 Игра завершена. Победитель: ${winner.username}`);
      
      setTimeout(() => {
        startNextGame(game);
      }, 3000);
      
    } else {
      // Переходим к следующему игроку
      do {
        game.currentTurn = (game.currentTurn + 1) % game.players.length;
      } while (game.players[game.currentTurn].folded);
      
      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Явно помечаем JSON поля как измененные для Sequelize

      
      game.changed('players', true);

      
      game.changed('pot', true);

      
      game.changed('settings', true);

      
      

      
      await game.save();
      
      console.log(`[FOLD] ⏭️ Ход переходит к игроку ${game.currentTurn}: ${game.players[game.currentTurn].username}`);
      
      // Запускаем бота если следующий игрок - бот
      if (game.players[game.currentTurn].isBot) {
        setImmediate(() => {
          processBotAction(gameId);
        });
      }
    }
    
    res.json({
      message: 'Карты сброшены',
      currentTurn: game.currentTurn,
      game: game
    });
    
  } catch (error) {
    console.error('[FOLD] Ошибка при сбросе карт:', error);
    res.status(500).json({ message: 'Ошибка при сбросе карт' });
  }
});

/**
 * @route   POST /api/poker/:gameId/call
 * @desc    Колл (уравнение ставки)
 * @access  Public
 */
router.post('/:gameId/call', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { userId } = req.body;
    
    console.log('[CALL] ================ ПОПЫТКА CALL ================');
    console.log(`[CALL] GameID: ${gameId}, UserID: ${userId}`);
    
    let game = await PokerGame.findByPk(gameId);
    if (!game) {
      return res.status(404).json({ message: 'Игра не найдена' });
    }
    
    if (game.status !== 'playing') {
      return res.status(400).json({ message: 'Игра не активна' });
    }
    
    const playerIndex = game.players.findIndex(p => p.user == userId);
    if (playerIndex === -1) {
      return res.status(404).json({ message: 'Игрок не найден в игре' });
    }
    
    if (game.currentTurn !== playerIndex) {
      return res.status(400).json({ message: 'Не ваш ход' });
    }
    
    const player = game.players[playerIndex];
    const currentBet = Math.max(...game.players.map(p => p.currentBet));
    const callAmount = currentBet - player.currentBet;
    
    console.log(`[CALL] Текущая максимальная ставка: ${currentBet}`);
    console.log(`[CALL] Ставка игрока: ${player.currentBet}`);
    console.log(`[CALL] Сумма для колла: ${callAmount}`);
    
    if (player.chips < callAmount) {
      // All-in если не хватает фишек
      const allInAmount = player.chips;
      player.currentBet += allInAmount;
      game.pot += allInAmount;
      player.chips = 0;
      player.isAllIn = true;
      player.hasActed = true;
      
      console.log(`[CALL] 🔥 All-in на ${allInAmount} фишек`);
    } else {
      // Обычный колл
      player.chips -= callAmount;
      player.currentBet += callAmount;
      game.pot += callAmount;
      player.hasActed = true;
      
      console.log(`[CALL] ✅ Колл на ${callAmount} фишек`);
    }
    
    console.log(`[CALL] Результат: chips=${player.chips}, bet=${player.currentBet}, pot=${game.pot}`);
    
    // Проверяем, все ли игроки сделали ход
    const activePlayers = game.players.filter(p => !p.folded);
    const playersToAct = activePlayers.filter(p => !p.hasActed && !p.isAllIn);
    const maxBet = Math.max(...activePlayers.map(p => p.currentBet));
    const playersNeedToMatchBet = activePlayers.filter(p => p.currentBet < maxBet && !p.isAllIn);
    
    if (playersToAct.length === 0 && playersNeedToMatchBet.length === 0) {
      // Все сделали ход и ставки равны - переходим к следующему раунду
      console.log(`[CALL] 🎯 Все игроки завершили действия, переходим к следующему раунду`);
      await advanceToNextRound(game);
    } else {
      // Переходим к следующему игроку
      do {
        game.currentTurn = (game.currentTurn + 1) % game.players.length;
      } while (game.players[game.currentTurn].folded);
      
      console.log(`[CALL] ⏭️ Ход переходит к игроку ${game.currentTurn}: ${game.players[game.currentTurn].username}`);
    }
    
    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Явно помечаем JSON поля как измененные для Sequelize

    
    game.changed('players', true);

    
    game.changed('pot', true);

    
    game.changed('settings', true);

    
    

    
    await game.save();
    
    // Запускаем бота если следующий игрок - бот
    if (game.status === 'playing' && game.players[game.currentTurn].isBot) {
      setImmediate(() => {
        processBotAction(gameId);
      });
    }
    
    res.json({
      message: player.isAllIn ? 'All-in!' : 'Ставка уравнена',
      currentTurn: game.currentTurn,
      game: game
    });
    
  } catch (error) {
    console.error('[CALL] Ошибка при колле:', error);
    res.status(500).json({ message: 'Ошибка при колле' });
  }
});

/**
 * @route   POST /api/poker/:gameId/raise
 * @desc    Повышение ставки (raise)
 * @access  Public
 */
router.post('/:gameId/raise', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { userId, amount } = req.body;
    
    console.log('[RAISE] ================ ПОПЫТКА RAISE ================');
    console.log(`[RAISE] GameID: ${gameId}, UserID: ${userId}, Amount: ${amount}`);
    
    let game = await PokerGame.findByPk(gameId);
    if (!game) {
      return res.status(404).json({ message: 'Игра не найдена' });
    }
    
    if (game.status !== 'playing') {
      return res.status(400).json({ message: 'Игра не активна' });
    }
    
    const playerIndex = game.players.findIndex(p => p.user == userId);
    if (playerIndex === -1) {
      return res.status(404).json({ message: 'Игрок не найден в игре' });
    }
    
    if (game.currentTurn !== playerIndex) {
      return res.status(400).json({ message: 'Не ваш ход' });
    }
    
    const player = game.players[playerIndex];
    const currentBet = Math.max(...game.players.map(p => p.currentBet));
    const raiseAmount = amount - player.currentBet;
    
    console.log(`[RAISE] Текущая максимальная ставка: ${currentBet}`);
    console.log(`[RAISE] Ставка игрока: ${player.currentBet}`);
    console.log(`[RAISE] Новая ставка: ${amount}`);
    console.log(`[RAISE] Сумма для рейза: ${raiseAmount}`);
    
    if (amount <= currentBet) {
      return res.status(400).json({ message: 'Размер рейза должен быть больше текущей ставки' });
    }
    
    if (player.chips < raiseAmount) {
      return res.status(400).json({ message: 'Недостаточно фишек для рейза' });
    }
    
    // Применяем рейз
    player.chips -= raiseAmount;
    player.currentBet = amount;
    game.pot += raiseAmount;
    player.hasActed = true;
    
    // Сбрасываем hasActed для всех остальных активных игроков
    game.players.forEach((p, idx) => {
      if (idx !== playerIndex && !p.folded) {
        p.hasActed = false;
      }
    });
    
    console.log(`[RAISE] ✅ Рейз до ${amount}. Результат: chips=${player.chips}, pot=${game.pot}`);
    
    // Переходим к следующему игроку
    do {
      game.currentTurn = (game.currentTurn + 1) % game.players.length;
    } while (game.players[game.currentTurn].folded);
    
    console.log(`[RAISE] ⏭️ Ход переходит к игроку ${game.currentTurn}: ${game.players[game.currentTurn].username}`);
    
    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Явно помечаем JSON поля как измененные для Sequelize

    
    game.changed('players', true);

    
    game.changed('pot', true);

    
    game.changed('settings', true);

    
    

    
    await game.save();
    
    // Запускаем бота если следующий игрок - бот
    if (game.players[game.currentTurn].isBot) {
      setImmediate(() => {
        processBotAction(gameId);
      });
    }
    
    res.json({
      message: `Ставка повышена до ${amount}`,
      currentTurn: game.currentTurn,
      game: game
    });
    
  } catch (error) {
    console.error('[RAISE] Ошибка при рейзе:', error);
    res.status(500).json({ message: 'Ошибка при рейзе' });
  }
});

/**
 * @route   POST /api/poker/:gameId/check
 * @desc    Чек (пропуск хода без ставки)
 * @access  Public
 */
router.post('/:gameId/check', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { userId } = req.body;
    
    console.log('[CHECK] ================ ПОПЫТКА CHECK ================');
    console.log(`[CHECK] GameID: ${gameId}, UserID: ${userId}`);
    
    let game = await PokerGame.findByPk(gameId);
    if (!game) {
      return res.status(404).json({ message: 'Игра не найдена' });
    }
    
    if (game.status !== 'playing') {
      return res.status(400).json({ message: 'Игра не активна' });
    }
    
    const playerIndex = game.players.findIndex(p => p.user == userId);
    if (playerIndex === -1) {
      return res.status(404).json({ message: 'Игрок не найден в игре' });
    }
    
    if (game.currentTurn !== playerIndex) {
      return res.status(400).json({ message: 'Не ваш ход' });
    }
    
    const player = game.players[playerIndex];
    const currentBet = Math.max(...game.players.map(p => p.currentBet));
    
    if (player.currentBet < currentBet) {
      return res.status(400).json({ message: 'Нельзя чекать при наличии ставки. Нужно либо уравнять, либо сбросить карты' });
    }
    
    // Применяем чек
    player.hasActed = true;
    
    console.log(`[CHECK] ✅ Чек игрока ${player.username}`);
    
    // Проверяем, все ли игроки сделали ход
    const activePlayers = game.players.filter(p => !p.folded);
    const playersToAct = activePlayers.filter(p => !p.hasActed && !p.isAllIn);
    
    if (playersToAct.length === 0) {
      // Все сделали ход - переходим к следующему раунду
      console.log(`[CHECK] 🎯 Все игроки завершили действия, переходим к следующему раунду`);
      await advanceToNextRound(game);
    } else {
      // Переходим к следующему игроку
      do {
        game.currentTurn = (game.currentTurn + 1) % game.players.length;
      } while (game.players[game.currentTurn].folded);
      
      console.log(`[CHECK] ⏭️ Ход переходит к игроку ${game.currentTurn}: ${game.players[game.currentTurn].username}`);
    }
    
    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Явно помечаем JSON поля как измененные для Sequelize

    
    game.changed('players', true);

    
    game.changed('pot', true);

    
    game.changed('settings', true);

    
    

    
    await game.save();
    
    // Запускаем бота если следующий игрок - бот
    if (game.status === 'playing' && game.players[game.currentTurn].isBot) {
      setImmediate(() => {
        processBotAction(gameId);
      });
    }
    
    res.json({
      message: 'Чек',
      currentTurn: game.currentTurn,
      game: game
    });
    
  } catch (error) {
    console.error('[CHECK] Ошибка при чеке:', error);
    res.status(500).json({ message: 'Ошибка при чеке' });
  }
});

/**
 * @route   POST /api/poker/:gameId/bot-action
 * @desc    Запуск действий ботов
 * @access  Public
 */
router.post('/:gameId/bot-action', async (req, res) => {
  try {
    const { gameId } = req.params;
    
    console.log(`[BOT-ACTION-ROUTE] Запрос на запуск бота для игры ${gameId}`);
    
    // Проверяем что игра существует
    const game = await PokerGame.findByPk(gameId);
    if (!game) {
      return res.status(404).json({ message: 'Игра не найдена' });
    }
    
    if (game.status !== 'playing') {
      return res.status(400).json({ message: 'Игра не активна' });
    }
    
    // Запускаем обработку бота асинхронно
    setImmediate(() => {
      processBotAction(gameId);
    });
    
    res.json({ message: 'Бот запущен' });
    
  } catch (error) {
    console.error(`[BOT-ACTION-ROUTE] Ошибка при запуске бота:`, error);
    res.status(500).json({ message: 'Ошибка при запуске бота' });
  }
});

console.log('Poker API loaded');
module.exports = router;

// Экспортируем функцию для тестирования
module.exports.startNextGame = startNextGame; 