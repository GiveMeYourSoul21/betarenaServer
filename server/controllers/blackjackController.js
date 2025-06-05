const BlackjackGame = require('../models/BlackjackGame');
const { User } = require('../models');

// Функция создания колоды для блэкджека
function createBlackjackDeck(numDecks = 6) {
  const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
  const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  let deck = [];

  for (let d = 0; d < numDecks; d++) {
    for (let suit of suits) {
      for (let value of values) {
        deck.push({ suit, value });
      }
    }
  }

  // Перемешиваем колоду
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

// Функция подсчета очков в блэкджеке
function calculateBlackjackScore(cards) {
  let score = 0;
  let aces = 0;

  for (let card of cards) {
    if (card.value === 'A') {
      aces++;
      score += 11;
    } else if (['J', 'Q', 'K'].includes(card.value)) {
      score += 10;
    } else {
      score += parseInt(card.value);
    }
  }

  // Обрабатываем тузы
  while (score > 21 && aces > 0) {
    score -= 10;
    aces--;
  }

  return score;
}

// Создание новой игры
exports.createGame = async (req, res) => {
  try {
    console.log('[BLACKJACK] Создание новой игры блэкджека...');
    const { userId, username } = req.body;
    
    if (!userId) {
      return res.status(400).json({ message: 'userId обязателен' });
    }

    // ИСПРАВЛЕНО: Пытаемся получить данные пользователя из базы данных, но не требуем его обязательно
    let user = null;
    let userChips = 1000;
    let finalUsername = 'Игрок';
    
    try {
      if (userId && userId.toString().match(/^\d+$/)) {
        // Если userId - число, ищем в базе
        user = await User.findByPk(userId);
        if (user) {
          userChips = user.chips || 1000;
          finalUsername = user.username || 'Игрок';
          console.log('[BLACKJACK] Получен пользователь из базы:', finalUsername, 'фишки:', userChips);
        } else {
          console.log(`[BLACKJACK] Пользователь с ID ${userId} не найден в базе, используем значения по умолчанию`);
          finalUsername = `Игрок${userId}`;
        }
      } else {
        // Если userId - строка, используем как username
        finalUsername = username || userId || 'Игрок';
        console.log(`[BLACKJACK] userId не является числом, используем как username: ${finalUsername}`);
      }
    } catch (userError) {
      console.log(`[BLACKJACK] Ошибка при поиске пользователя, используем значения по умолчанию:`, userError.message);
      finalUsername = username || userId || 'Игрок';
    }

    // Создаем колоду
    const deck = createBlackjackDeck(6); // 6 колод
    
    // Начальная ставка
    const initialBet = 10;
    
    // Создаем игрока
    const player = {
      user: userId,
      username: finalUsername,
      chips: userChips,
      cards: [],
      bet: initialBet,
      isBot: false,
      stand: false,
      bust: false,
      blackjack: false,
      score: 0
    };

    // Создаем дилера в settings
    const dealer = {
      cards: [],
      stand: false,
      bust: false,
      score: 0
    };

    // Создаем игру
    const gameData = {
      type: 'blackjack',
      status: 'playing',
      players: [player],
      deck: deck,
      settings: {
        numDecks: 6,
        initialBet: initialBet,
        minBet: 10,
        maxBet: 500,
        dealer: dealer // Сохраняем дилера в settings
      },
      pot: initialBet,
      userId: userId
    };

    const newGame = await BlackjackGame.create(gameData);
    
    console.log('[BLACKJACK] Игра создана с ID:', newGame.id);
    res.status(201).json({
      gameId: newGame.id,
      message: 'Игра в блэкджек создана успешно',
      game: newGame
    });

  } catch (error) {
    console.error('[BLACKJACK] Ошибка при создании игры:', error);
    res.status(500).json({ message: 'Ошибка при создании игры' });
  }
};

// Функция раздачи начальных карт
function dealInitialCards(game) {
  const player = game.players[0];
  
  // Раздаем по 2 карты игроку и дилеру
  player.cards = [game.deck.pop(), game.deck.pop()];
  game.dealer.cards = [game.deck.pop(), game.deck.pop()];
  
  // Подсчитываем очки
  player.score = calculateBlackjackScore(player.cards);
  game.dealer.score = calculateBlackjackScore([game.dealer.cards[0]]); // Только первая карта дилера
  
  // Проверяем блэкджек у игрока
  if (player.score === 21) {
    player.blackjack = true;
    game.status = 'finished';
    
    // Проверяем блэкджек у дилера
    const dealerFullScore = calculateBlackjackScore(game.dealer.cards);
    if (dealerFullScore === 21) {
      game.winner = 'draw';
    } else {
      game.winner = player.username;
      player.chips += Math.floor(player.bet * 2.5); // Блэкджек платит 3:2
    }
  }
}

// Получение данных игры
exports.getGame = async (req, res) => {
  try {
    const { gameId } = req.params;
    
    const game = await BlackjackGame.findByPk(gameId);
    if (!game) {
      return res.status(404).json({ message: 'Игра не найдена' });
    }

    res.json(game);
  } catch (error) {
    console.error('Ошибка при получении данных игры:', error);
    res.status(500).json({ message: 'Ошибка при получении данных игры' });
  }
};

// Действие игрока: взять карту
exports.hit = async (req, res) => {
  try {
    const { gameId } = req.params;
    
    const game = await BlackjackGame.findByPk(gameId);
    if (!game || game.status !== 'playing') {
      return res.status(400).json({ message: 'Игра недоступна' });
    }

    const player = game.players[0];
    if (player.stand || player.bust) {
      return res.status(400).json({ message: 'Игрок не может взять карту' });
    }

    // Берем карту
    const newCard = game.deck.pop();
    player.cards.push(newCard);
    player.score = calculateBlackjackScore(player.cards);

    // Проверяем перебор
    if (player.score > 21) {
      player.bust = true;
      game.status = 'finished';
      game.winner = 'dealer';
    }

    await game.save();
    res.json(game);
  } catch (error) {
    console.error('Ошибка при взятии карты:', error);
    res.status(500).json({ message: 'Ошибка при взятии карты' });
  }
};

// Действие игрока: стоп
exports.stand = async (req, res) => {
  try {
    const { gameId } = req.params;
    
    const game = await BlackjackGame.findByPk(gameId);
    if (!game || game.status !== 'playing') {
      return res.status(400).json({ message: 'Игра недоступна' });
    }

    const player = game.players[0];
    player.stand = true;

    // Игра дилера
    playDealer(game);
    
    // Определяем победителя
    determineWinner(game);

    await game.save();
    res.json(game);
  } catch (error) {
    console.error('Ошибка при остановке:', error);
    res.status(500).json({ message: 'Ошибка при остановке' });
  }
};

// Логика игры дилера
function playDealer(game) {
  game.dealer.score = calculateBlackjackScore(game.dealer.cards);
  
  // Дилер берет карты пока у него меньше 17
  while (game.dealer.score < 17) {
    const newCard = game.deck.pop();
    game.dealer.cards.push(newCard);
    game.dealer.score = calculateBlackjackScore(game.dealer.cards);
  }
  
  if (game.dealer.score > 21) {
    game.dealer.bust = true;
  }
  
  game.dealer.stand = true;
}

// Определение победителя
function determineWinner(game) {
  const player = game.players[0];
  const dealer = game.dealer;
  
  game.status = 'finished';
  
  if (player.bust) {
    game.winner = 'dealer';
  } else if (dealer.bust) {
    game.winner = player.username;
    player.chips += player.bet * 2;
  } else if (player.score > dealer.score) {
    game.winner = player.username;
    player.chips += player.bet * 2;
  } else if (player.score < dealer.score) {
    game.winner = 'dealer';
  } else {
    game.winner = 'draw';
    player.chips += player.bet; // Возвращаем ставку
  }
}

module.exports = exports; 