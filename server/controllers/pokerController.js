const { PokerGame, User } = require('../models');
const { 
  createDeck, 
  dealCards 
} = require('../utils/pokerUtils');

// Создание новой игры
exports.createGame = async (req, res) => {
  try {
    console.log('[CONTROLLER] Создание игры через контроллер');
    const { userId, username } = req.body;
    
    console.log('userId:', userId, 'username:', username);
    
    // ИСПРАВЛЕНО: Создаем пользователя если его нет, или используем существующего
    let user = null;
    try {
      if (userId && userId.toString().match(/^\d+$/)) {
        // Если userId - число, ищем в базе
        user = await User.findByPk(userId);
        if (!user) {
          console.log(`[CONTROLLER] Пользователь с ID ${userId} не найден, продолжаем без проверки`);
        }
      } else {
        // Если userId - строка, то это просто имя пользователя
        console.log(`[CONTROLLER] userId "${userId}" не является числом, используем как username`);
      }
    } catch (userError) {
      console.log(`[CONTROLLER] Ошибка при поиске пользователя, продолжаем без проверки:`, userError.message);
    }
    
    // Рандомно выбираем позицию дилера (0-3)
    const dealerPosition = Math.floor(Math.random() * 4);
    console.log('Выбрана позиция дилера:', dealerPosition);
    
    // Создаем массив игроков
    const players = [
      {
        user: userId || null,
        username: username || 'Игрок',
        chips: 1000,
        cards: [],
        position: 0,
        currentBet: 0,
        isBot: false,
        isDealer: false,
        isSmallBlind: false,
        isBigBlind: false,
        isUTG: false,
        folded: false,
        isAllIn: false,
        hasActed: false
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
        isUTG: false,
        folded: false,
        isAllIn: false,
        hasActed: false
      });
    }
    
    // Устанавливаем позиции в зависимости от дилера
    const sbPosition = (dealerPosition + 1) % 4;
    const bbPosition = (dealerPosition + 2) % 4;
    const utgPosition = (dealerPosition + 3) % 4;
    
    console.log(`Позиции: Дилер=${dealerPosition}, SB=${sbPosition}, BB=${bbPosition}, UTG=${utgPosition}`);
    
    players[dealerPosition].isDealer = true;
    players[sbPosition].isSmallBlind = true;
    players[bbPosition].isBigBlind = true;
    players[utgPosition].isUTG = true;
    
    // Устанавливаем начальные банки с учетом блайндов
    players[sbPosition].chips = 990; // Минус малый блайнд
    players[sbPosition].currentBet = 10;
    players[bbPosition].chips = 980; // Минус большой блайнд
    players[bbPosition].currentBet = 20;
    
    // Создаем объект игры
    const gameData = {
      type: 'poker',
      players: players,
      pot: 30,
      deck: createDeck(),
      communityCards: [],
      currentRound: 'preflop',
      currentTurn: utgPosition,
      status: 'playing',
      settings: {
        maxPlayers: 4,
        smallBlind: 10,
        bigBlind: 20,
        currentTurn: utgPosition,
        currentRound: 'preflop',
        dealerPosition: dealerPosition
      },
      dealerPosition: dealerPosition,
      winner: null,
      winningHand: null,
      user_id: userId
    };
    
    const newGame = await PokerGame.create(gameData);

    // Раздаем карты
    dealCards(newGame);
    
    await newGame.save();
    
    console.log(`Игра создана через контроллер: ${newGame.id}`);

    res.status(201).json({
      message: 'Игра создана',
      gameId: newGame.id,
      dealerPosition: newGame.dealerPosition,
      players: newGame.players
    });
  } catch (error) {
    console.error('Ошибка при создании игры:', error);
    res.status(500).json({ message: 'Ошибка при создании игры' });
  }
};

// Получение данных игры
exports.getGame = async (req, res) => {
  try {
    const { gameId } = req.params;
    
    const game = await PokerGame.findByPk(gameId);
    if (!game) {
      return res.status(404).json({ message: 'Игра не найдена' });
    }

    res.json(game);
  } catch (error) {
    console.error('Ошибка при получении данных игры:', error);
    res.status(500).json({ message: 'Ошибка при получении данных игры' });
  }
};

// Начало игры
exports.startGame = async (req, res) => {
  try {
    const { gameId } = req.params;
    
    const game = await PokerGame.findByPk(gameId);
    if (!game) {
      return res.status(404).json({ message: 'Игра не найдена' });
    }

    if (game.status !== 'waiting') {
      return res.status(400).json({ message: 'Игра уже началась или завершена' });
    }

    // Убедимся, что у нас есть все игроки
    if (game.players.length !== 4) {
      return res.status(400).json({ message: 'Недостаточно игроков для начала игры' });
    }

    // Обновляем блайнды и балансы игроков
    await game.updateBlinds();

    // Устанавливаем статус игры
    game.status = 'playing';
    game.currentRound = 'preflop';
    
    // Устанавливаем первый ход на UTG
    game.currentTurn = (game.dealerPosition + 3) % 4;

    await game.save();

    // Отправляем обновление через Socket.IO
    if (req.io) {
      req.io.to(gameId).emit('gameUpdate', game);
    }

    res.json(game);
  } catch (error) {
    console.error('Ошибка при начале игры:', error);
    res.status(500).json({ message: 'Ошибка при начале игры' });
  }
};

// Выход из игры
exports.exitGame = async (req, res) => {
  try {
    const { gameId } = req.params;
    const { userId } = req.body;

    const game = await PokerGame.findByPk(gameId);
    if (!game) {
      return res.status(404).json({ message: 'Игра не найдена' });
    }

    // Если игра еще не завершена, помечаем её как завершенную
    if (game.status !== 'finished') {
      game.status = 'finished';
      await game.save();
    }

    // Удаляем игру из базы данных
    await PokerGame.destroy({ where: { id: gameId } });

    res.json({ message: 'Вы вышли из игры' });
  } catch (error) {
    console.error('Ошибка при выходе из игры:', error);
    res.status(500).json({ message: 'Ошибка при выходе из игры' });
  }
};

// Присоединение к игре
exports.joinGame = async (req, res) => {
  try {
    const { gameId } = req.params;
    const { userId, username } = req.body;

    const game = await PokerGame.findByPk(gameId);
    if (!game) {
      return res.status(404).json({ message: 'Игра не найдена' });
    }

    if (game.status !== 'waiting') {
      return res.status(400).json({ message: 'Нельзя присоединиться к начатой или завершённой игре' });
    }

    if (game.players.length >= 4) {
      return res.status(400).json({ message: 'Игра полна' });
    }

    // Проверяем, не присоединён ли уже пользователь
    const existingPlayer = game.players.find(p => p.user === userId);
    if (existingPlayer) {
      return res.status(400).json({ message: 'Вы уже в этой игре' });
    }

    // Добавляем игрока
    game.players.push({
      user: userId,
      username: username,
      chips: 1000,
      cards: [],
      position: game.players.length,
      currentBet: 0,
      isBot: false,
      folded: false,
      isAllIn: false,
      hasActed: false
    });

    await game.save();

    // Отправляем обновление через Socket.IO
    if (req.io) {
      req.io.to(gameId).emit('gameUpdate', game);
    }

    res.json(game);
  } catch (error) {
    console.error('Ошибка при присоединении к игре:', error);
    res.status(500).json({ message: 'Ошибка при присоединении к игре' });
  }
};

// Получение типа игры
exports.getGameType = async (req, res) => {
  try {
    const { gameId } = req.params;
    
    const game = await PokerGame.findByPk(gameId);
    if (!game) {
      return res.status(404).json({ message: 'Игра не найдена' });
    }

    res.json({ type: 'poker' });
  } catch (error) {
    console.error('Ошибка при получении типа игры:', error);
    res.status(500).json({ message: 'Ошибка при получении типа игры' });
  }
}; 