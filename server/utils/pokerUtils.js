/**
 * Утилиты для покерной игры
 */

// Создание новой колоды карт
function createDeck() {
  const crypto = require('crypto');
  const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
  const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  
  const deck = [];
  
  // Добавляем дополнительную энтропию через временную метку и случайный байт
  const timestamp = Date.now();
  const randomSeed = crypto.randomBytes(8).toString('hex');
  console.log(`[CARDS] 🎲 Создаем колоду с временной меткой: ${timestamp}, seed: ${randomSeed}`);
  
  // Создаем колоду из всех комбинаций масти и значения
  for (const suit of suits) {
    for (const value of values) {
      deck.push({ 
        suit, 
        value,
        // Добавляем уникальный ID для отслеживания карт
        id: `${value}-${suit}-${timestamp}-${randomSeed}`
      });
    }
  }
  
  // Проверяем что создалось ровно 52 карты
  if (deck.length !== 52) {
    console.error(`[CARDS] ❌ ОШИБКА: Создана колода из ${deck.length} карт вместо 52!`);
  } else {
    console.log(`[CARDS] ✅ Создана колода из ${deck.length} карт`);
  }
  
  // Перемешиваем колоду несколько раз для лучшей рандомизации
  let shuffled = shuffleDeck(deck);
  shuffled = shuffleDeck(shuffled);  // Дополнительное перемешивание
  
  console.log(`[CARDS] 🔀 Колода перемешана дважды для максимальной рандомизации`);
  
  return shuffled;
}

// Перемешивание колоды (алгоритм Фишера-Йейтса с криптографически безопасным генератором)
function shuffleDeck(deck) {
  const crypto = require('crypto');
  const shuffled = [...deck];
  
  for (let i = shuffled.length - 1; i > 0; i--) {
    // Используем криптографически безопасный генератор случайных чисел
    const randomBytes = crypto.randomBytes(4);
    const randomInt = randomBytes.readUInt32BE(0);
    const j = randomInt % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  console.log(`[CARDS] ✅ Колода перемешана криптографически безопасным генератором`);
  return shuffled;
}

// НОВАЯ ФУНКЦИЯ: Проверка уникальности всех карт в игре
function validateGameCards(game) {
  const allCards = new Set();
  const duplicates = [];
  const cardsList = [];
  
  // Собираем все карты игроков
  for (let i = 0; i < game.players.length; i++) {
    if (game.players[i].cards) {
      for (const card of game.players[i].cards) {
        if (card && card.value && card.suit) {
          const cardKey = `${card.value}-${card.suit}`;
          cardsList.push(`Игрок ${i} (${game.players[i].username}): ${cardKey}`);
          
          if (allCards.has(cardKey)) {
            duplicates.push(`Игрок ${i} (${game.players[i].username}): ${cardKey}`);
          } else {
            allCards.add(cardKey);
          }
        }
      }
    }
  }
  
  // Собираем общие карты
  if (game.settings && game.settings.communityCards) {
    for (const card of game.settings.communityCards) {
      if (card && card.value && card.suit) {
        const cardKey = `${card.value}-${card.suit}`;
        cardsList.push(`Общие карты: ${cardKey}`);
        
        if (allCards.has(cardKey)) {
          duplicates.push(`Общие карты: ${cardKey}`);
        } else {
          allCards.add(cardKey);
        }
      }
    }
  }
  
  // Логируем все карты для отладки
  console.log(`[CARDS] 📋 Все карты в игре:`);
  cardsList.forEach(cardInfo => console.log(`[CARDS]   - ${cardInfo}`));
  
  if (duplicates.length > 0) {
    console.error(`[CARDS] ❌ ОБНАРУЖЕНЫ ДУБЛИКАТЫ КАРТ:`, duplicates);
    return {
      isValid: false,
      errors: duplicates,
      totalCards: allCards.size,
      duplicateCount: duplicates.length
    };
  }
  
  console.log(`[CARDS] ✅ Проверка карт пройдена. Всего уникальных карт: ${allCards.size}`);
  return {
    isValid: true,
    totalCards: allCards.size,
    duplicateCount: 0
  };
}

// Раздача карт игрокам
function dealCards(game) {
  // ИСПРАВЛЕНИЕ: Всегда создаем НОВУЮ перемешанную колоду для каждой игры
  console.log(`[CARDS] Создаем новую колоду для игры`);
  game.deck = createDeck();
  console.log(`[CARDS] Создана новая перемешанная колода из ${game.deck.length} карт`);
  
  // ДОБАВЛЕНО: Создаем множество использованных карт для проверки дубликатов
  const usedCards = new Set();
  
  // Раздаем карты игрокам
  for (let i = 0; i < game.players.length; i++) {
    const isBot = !!game.players[i].isBot;
    
    // ДОБАВЛЕНО: Проверяем что в колоде достаточно карт
    if (game.deck.length < 2) {
      console.error(`[CARDS] ❌ Недостаточно карт в колоде для игрока ${i}!`);
      break;
    }
    
    const card1 = game.deck.pop();
    const card2 = game.deck.pop();
    
    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Проверяем дубликаты
    const card1Key = `${card1.value}-${card1.suit}`;
    const card2Key = `${card2.value}-${card2.suit}`;
    
    if (usedCards.has(card1Key) || usedCards.has(card2Key) || card1Key === card2Key) {
      console.error(`[CARDS] ❌ ДУБЛИКАТ КАРТ для игрока ${i}: ${card1Key}, ${card2Key}`);
      console.error(`[CARDS] Уже использованные карты:`, Array.from(usedCards));
      // Можно попробовать взять другие карты или пересоздать колоду
      continue;
    }
    
    usedCards.add(card1Key);
    usedCards.add(card2Key);
    
    console.log(`[CARDS] Игрок ${i} (${game.players[i].username}): ${card1.value} ${card1.suit}, ${card2.value} ${card2.suit}`);
    
    // Явно устанавливаем видимость карт
    game.players[i].cards = [
      { 
        suit: card1.suit, 
        value: card1.value, 
        hidden: isBot // true для ботов, false для реального игрока
      },
      { 
        suit: card2.suit, 
        value: card2.value, 
        hidden: isBot // true для ботов, false для реального игрока
      }
    ];
  }
  
  console.log(`[CARDS] Роздано ${game.players.length * 2} карт. Осталось в колоде: ${game.deck.length}`);
  
  // ДОБАВЛЕНО: Проверяем валидность всех карт после раздачи
  const cardsValidation = validateGameCards(game);
  if (!cardsValidation.isValid) {
    console.error(`[CARDS] ❌ КРИТИЧЕСКАЯ ОШИБКА при раздаче карт:`, cardsValidation.errors);
  } else {
    console.log(`[CARDS] ✅ Все карты уникальны после раздачи. Всего карт: ${cardsValidation.totalCards}`);
  }
  
  return game;
}

// Раздача общих карт на стол
function dealCommunityCards(deck, count, game) {
  // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Теперь принимаем игру для проверки всех выданных карт
  console.log(`[CARDS] 🃏 Начинаем выдачу ${count} общих карт`);
  const cards = [];
  
  // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Проверяем достаточно ли карт в колоде
  if (!deck || !Array.isArray(deck)) {
    console.error('[CARDS] ❌ Колода недоступна или не является массивом!');
    return cards;
  }
  
  if (deck.length < count) {
    console.error(`[CARDS] ❌ В колоде недостаточно карт! Нужно: ${count}, доступно: ${deck.length}`);
    return cards;
  }
  
  // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Собираем ВСЕ уже выданные карты в игре
  const allUsedCards = new Set();
  
  // Добавляем карты игроков
  if (game && game.players) {
    game.players.forEach((player, playerIndex) => {
      if (player.cards && Array.isArray(player.cards)) {
        player.cards.forEach(card => {
          if (card && card.suit && card.value) {
            const cardKey = `${card.value}-${card.suit}`;
            allUsedCards.add(cardKey);
            console.log(`[CARDS] ♠️ Игрок ${playerIndex} (${player.username}) имеет карту: ${cardKey}`);
          }
        });
      }
    });
  }
  
  // Добавляем уже выложенные общие карты
  if (game && game.settings && game.settings.communityCards) {
    game.settings.communityCards.forEach(card => {
      if (card && card.suit && card.value) {
        const cardKey = `${card.value}-${card.suit}`;
        allUsedCards.add(cardKey);
        console.log(`[CARDS] 🎴 Общая карта уже на столе: ${cardKey}`);
      }
    });
  }
  
  console.log(`[CARDS] 📊 Всего уже выданных карт в игре: ${allUsedCards.size}`);
  console.log(`[CARDS] 📦 Карт в колоде перед выдачей: ${deck.length}`);
  
  // ДОБАВЛЕНО: Создаем множество карт выданных в этом вызове для проверки дубликатов
  const thisCallCards = new Set();
  
  // Пытаемся выдать нужное количество карт
  let attempts = 0;
  const maxAttempts = deck.length * 2; // Защита от бесконечного цикла
  
  for (let i = 0; i < count && attempts < maxAttempts; attempts++) {
    if (deck.length === 0) {
      console.error('[CARDS] ❌ Колода пуста! Не могу выдать общие карты');
      break;
    }
    
    const card = deck.pop();
    
    // ИСПРАВЛЕНО: Проверяем что карта не дублируется
    if (!card || !card.suit || !card.value) {
      console.error('[CARDS] ❌ Получена пустая или невалидная карта из колоды!');
      continue; // Переходим к следующей попытке
    }
    
    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Проверяем дубликаты карт во ВСЕЙ игре
    const cardKey = `${card.value}-${card.suit}`;
    
    if (allUsedCards.has(cardKey)) {
      console.error(`[CARDS] ❌ ДУБЛИКАТ КАРТЫ ОБНАРУЖЕН в игре: ${cardKey}! Возвращаем в конец колоды...`);
      deck.unshift(card); // Возвращаем карту в начало колоды
      continue; // Переходим к следующей попытке
    }
    
    if (thisCallCards.has(cardKey)) {
      console.error(`[CARDS] ❌ ДУБЛИКАТ КАРТЫ в этом вызове: ${cardKey}! Возвращаем в конец колоды...`);
      deck.unshift(card); // Возвращаем карту в начало колоды
      continue; // Переходим к следующей попытке
    }
    
    // Карта уникальная, добавляем её
    allUsedCards.add(cardKey);
    thisCallCards.add(cardKey);
    
    console.log(`[CARDS] ✅ Выдаем карту ${i + 1}/${count}: ${card.value} ${card.suit}`);
    
    cards.push({
      suit: card.suit,
      value: card.value,
      hidden: false // Общие карты всегда открыты
    });
    
    i++; // Увеличиваем счетчик только при успешной выдаче карты
  }
  
  if (attempts >= maxAttempts) {
    console.error(`[CARDS] ❌ КРИТИЧЕСКАЯ ОШИБКА: Достигнуто максимальное количество попыток (${maxAttempts}) при выдаче карт!`);
  }
  
  console.log(`[CARDS] ✅ Выдано ${cards.length}/${count} общих карт:`, cards.map(c => `${c.value} ${c.suit}`).join(', '));
  console.log(`[CARDS] 📦 Осталось в колоде: ${deck.length}`);
  
  // ДОБАВЛЕНО: Финальная проверка что мы не выдали дубликаты
  const cardKeys = cards.map(c => `${c.value}-${c.suit}`);
  const uniqueCards = new Set(cardKeys);
  if (cardKeys.length !== uniqueCards.size) {
    console.error(`[CARDS] ❌ КРИТИЧЕСКАЯ ОШИБКА: Выданы дубликаты в одном вызове!`, cardKeys);
  }
  
  return cards;
}

// Вспомогательная функция для перемешивания массива
function shuffleArray(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Переход к следующему раунду
function nextRound(game) {
  console.log(`[ROUND] ====== ПЕРЕХОД К СЛЕДУЮЩЕМУ РАУНДУ ======`);
  
  // Инициализируем settings если не существует
  if (!game.settings) {
    game.settings = {};
  }
  
  // Защита от множественного вызова
  if (game.settings.roundTransition) {
    console.log(`[ROUND] 🚫 Переход к раунду уже в процессе, игнорируем повторный вызов`);
    return game;
  }
  game.settings.roundTransition = true;
  
  // Инициализируем communityCards если не существует
  if (!game.settings.communityCards) {
    game.settings.communityCards = [];
  }
  
  // Сбрасываем флаги действий игроков
  console.log(`[ROUND] 🔄 СБРОС hasActed для нового раунда`);
  game.players.forEach((player, index) => {
    if (!player.folded) {
      player.hasActed = false;
      console.log(`[ROUND] Сбрасываем hasActed для игрока ${index}: ${player.username}`);
    }
  });
  
  const currentRound = game.settings.currentRound || 'preflop';
  console.log(`[ROUND] Текущий раунд: ${currentRound}`);
  
  // Переходим к следующему раунду
  switch (currentRound) {
    case 'preflop':
      game.settings.currentRound = 'flop';
      // СТРОГАЯ проверка - выдавать карты только если флоп НЕ выложен
      if (!game.settings.communityCards || game.settings.communityCards.length === 0) {
        console.log(`[ROUND] ✅ Выдаем ФЛОП (3 карты)`);
        const flopCards = dealCommunityCards(game.deck, 3, game);
        game.settings.communityCards = [...flopCards];
        console.log(`[ROUND] Переход к флопу, выложено ${flopCards.length} карт:`, flopCards.map(c => `${c.value} ${c.suit}`).join(', '));
      } else {
        console.log(`[ROUND] ❌ ФЛОП УЖЕ ВЫЛОЖЕН (${game.settings.communityCards.length} карт), НЕ выдаем карты`);
      }
      break;
    case 'flop':
      game.settings.currentRound = 'turn';
      // СТРОГАЯ проверка - выдавать карты только если терн НЕ выложен
      if (game.settings.communityCards && game.settings.communityCards.length === 3) {
        console.log(`[ROUND] ✅ Выдаем ТЕРН (1 карта)`);
        const turnCards = dealCommunityCards(game.deck, 1, game);
        game.settings.communityCards.push(...turnCards);
        console.log(`[ROUND] Переход к терну, выложена ${turnCards.length} карта:`, turnCards.map(c => `${c.value} ${c.suit}`).join(', '));
      } else {
        console.log(`[ROUND] ❌ ТЕРН УЖЕ ВЫЛОЖЕН (${game.settings.communityCards?.length || 0} карт), НЕ выдаем карты`);
      }
      break;
    case 'turn':
      game.settings.currentRound = 'river';
      // СТРОГАЯ проверка - выдавать карты только если ривер НЕ выложен
      if (game.settings.communityCards && game.settings.communityCards.length === 4) {
        console.log(`[ROUND] ✅ Выдаем РИВЕР (1 карта)`);
        const riverCards = dealCommunityCards(game.deck, 1, game);
        game.settings.communityCards.push(...riverCards);
        console.log(`[ROUND] Переход к риверу, выложена ${riverCards.length} карта:`, riverCards.map(c => `${c.value} ${c.suit}`).join(', '));
      } else {
        console.log(`[ROUND] ❌ РИВЕР УЖЕ ВЫЛОЖЕН (${game.settings.communityCards?.length || 0} карт), НЕ выдаем карты`);
      }
      break;
    case 'river':
      game.settings.currentRound = 'showdown';
      console.log(`[ROUND] Переход к шоудауну`);
      // Снимаем блокировку перед showdown
      game.settings.roundTransition = false;
      // Определяем победителя
      return determineWinner(game);
    default:
      // Уже на showdown, завершаем игру
      game.status = 'finished';
      game.settings.roundTransition = false;
  }

  // На новом раунде первый ход делает первый активный игрок после дилера
  const dealerIndex = game.players.findIndex(p => p.isDealer);
  const playersCount = game.players.length;
  
  let nextPlayerIndex = (dealerIndex + 1) % playersCount;
  
  // Ищем первого активного игрока после дилера
  for (let i = 0; i < playersCount; i++) {
    if (!game.players[nextPlayerIndex]?.folded) {
      break;
    }
    nextPlayerIndex = (nextPlayerIndex + 1) % playersCount;
  }
  
  console.log(`[ROUND] Позиция дилера: ${dealerIndex}`);
  console.log(`[ROUND] Новый раунд ${game.settings.currentRound}, ход игрока ${nextPlayerIndex} (${game.players[nextPlayerIndex]?.username})`);
  
  game.settings.currentTurn = nextPlayerIndex;
  
  // Снимаем блокировку перехода раунда
  game.settings.roundTransition = false;
  
  // ДОБАВЛЕНО: Проверяем уникальность всех карт в игре после раунда
  const gameValidation = validateGameCards(game);
  if (!gameValidation.isValid) {
    console.error(`[ROUND] ❌ КРИТИЧЕСКАЯ ОШИБКА после перехода к раунду ${game.settings.currentRound}:`, gameValidation.errors);
  } else {
    console.log(`[ROUND] ✅ Проверка карт после раунда ${game.settings.currentRound} прошла успешно`);
  }
  
  return game;
}

// Переход хода к следующему игроку
function nextTurn(game) {
  // Инициализируем settings если не существует
  if (!game.settings) {
    game.settings = {};
  }
  
  const currentTurn = game.settings.currentTurn || 0;
  const playersCount = game.players.length;
  let nextPlayerIndex = (currentTurn + 1) % playersCount;
  
  // Если все игроки сделали ход, переходим к следующему раунду
  let allPlayersActed = true;
  let activePlayers = 0;
  
  for (let i = 0; i < playersCount; i++) {
    if (!game.players[i].folded) {
      activePlayers++;
      
      // Максимальная ставка в текущем раунде
      const maxBet = Math.max(...game.players.map(p => p.currentBet || 0));
      
      // Если игрок не сделал ставку, равную максимальной, и не выбыл, значит, не все игроки сделали ход
      if (!game.players[i].hasActed || game.players[i].currentBet < maxBet) {
        allPlayersActed = false;
      }
    }
  }
  
  // Если остался только один активный игрок, определяем победителя и завершаем игру
  if (activePlayers <= 1) {
    return determineWinner(game);
  }
  
  // Если все сделали ход, переходим к следующему раунду
  if (allPlayersActed) {
    return nextRound(game);
  }
  
  // Ищем следующего активного игрока
  for (let i = 0; i < playersCount; i++) {
    if (!game.players[nextPlayerIndex].folded) {
      break;
    }
    nextPlayerIndex = (nextPlayerIndex + 1) % playersCount;
  }
  
  game.settings.currentTurn = nextPlayerIndex;
  return game;
}

// Определение комбинации карт и её силы
function evaluateHand(cards) {
  // Приводим карты к единому формату для вычисления
  const formattedCards = cards.map(card => {
    let value = card.value;
    // Приводим буквенные значения к числовым для сравнения
    if (value === 'J') value = '11';
    if (value === 'Q') value = '12';
    if (value === 'K') value = '13';
    if (value === 'A') value = '14'; // Туз - самая старшая карта
    
    return {
      suit: card.suit,
      value: parseInt(value, 10),
      original: card.value
    };
  });
  
  // Сортируем карты по значению (от большего к меньшему)
  formattedCards.sort((a, b) => b.value - a.value);
  
  // Проверка комбинаций от самой сильной к самой слабой
  
  // 1. Роял-флеш (Royal Flush)
  const royalFlush = isRoyalFlush(formattedCards);
  if (royalFlush.found) {
    return { rank: 10, name: 'Роял-флеш', cards: royalFlush.cards };
  }
  
  // 2. Стрит-флеш (Straight Flush)
  const straightFlush = isStraightFlush(formattedCards);
  if (straightFlush.found) {
    return { rank: 9, name: 'Стрит-флеш', cards: straightFlush.cards };
  }
  
  // 3. Каре (Four of a Kind)
  const fourOfAKind = isFourOfAKind(formattedCards);
  if (fourOfAKind.found) {
    return { rank: 8, name: 'Каре', cards: fourOfAKind.cards };
  }
  
  // 4. Фулл-хаус (Full House)
  const fullHouse = isFullHouse(formattedCards);
  if (fullHouse.found) {
    return { rank: 7, name: 'Фулл-хаус', cards: fullHouse.cards };
  }
  
  // 5. Флеш (Flush)
  const flush = isFlush(formattedCards);
  if (flush.found) {
    return { rank: 6, name: 'Флеш', cards: flush.cards };
  }
  
  // 6. Стрит (Straight)
  const straight = isStraight(formattedCards);
  if (straight.found) {
    return { rank: 5, name: 'Стрит', cards: straight.cards };
  }
  
  // 7. Тройка (Three of a Kind)
  const threeOfAKind = isThreeOfAKind(formattedCards);
  if (threeOfAKind.found) {
    return { rank: 4, name: 'Тройка', cards: threeOfAKind.cards };
  }
  
  // 8. Две пары (Two Pairs)
  const twoPairs = isTwoPairs(formattedCards);
  if (twoPairs.found) {
    return { rank: 3, name: 'Две пары', cards: twoPairs.cards };
  }
  
  // 9. Пара (One Pair)
  const onePair = isOnePair(formattedCards);
  if (onePair.found) {
    return { rank: 2, name: 'Пара', cards: onePair.cards };
  }
  
  // 10. Старшая карта (High Card)
  return { rank: 1, name: 'Старшая карта', cards: [formattedCards[0]] };
}

// Определение победителя
function determineWinner(game) {
  console.log(`[SHOWDOWN] 🏁 Начинаем определение победителя`);
  
  // ДОБАВЛЕНО: Финальная проверка всех карт в игре перед шоудауном
  const gameValidation = validateGameCards(game);
  if (!gameValidation.isValid) {
    console.error(`[SHOWDOWN] ❌ КРИТИЧЕСКАЯ ОШИБКА перед шоудауном:`, gameValidation.errors);
  } else {
    console.log(`[SHOWDOWN] ✅ Финальная проверка карт перед шоудауном прошла успешно`);
  }
  
  // Определяем активных игроков (не сбросивших карты)
  const activePlayers = game.players.filter(p => !p.folded);
  
  // Если остался только один активный игрок, он побеждает
  if (activePlayers.length === 1) {
    const winner = activePlayers[0];
    
    // Добавляем банк к фишкам победителя
    const winnerIndex = game.players.findIndex(p => p === winner);
    game.players[winnerIndex].chips += game.pot;
    
    // Обновляем данные игры
    game.pot = 0;
    game.status = 'finished';
    game.winner = winner.username || 'Игрок ' + winnerIndex;
    game.winningHand = 'Все остальные игроки сбросили карты';
    
    return game;
  }
  
  // Если игра дошла до вскрытия, определяем сильнейшую комбинацию
  const playersWithHandRanks = activePlayers.map(player => {
    // Инициализируем settings если не существует
    if (!game.settings) {
      game.settings = {};
    }
    if (!game.settings.communityCards) {
      game.settings.communityCards = [];
    }
    
    // Объединяем карты игрока с общими картами
    const hand = [...player.cards, ...game.settings.communityCards];
    
    // Оцениваем комбинацию
    const { rank, name, cards } = evaluateHand(hand);
    
    // Возвращаем игрока с данными о его комбинации
    return {
      player,
      playerIndex: game.players.findIndex(p => p === player),
      handRank: rank,
      handName: name,
      bestCards: cards
    };
  });
  
  // Сортируем по рангу комбинации (от высшего к низшему)
  playersWithHandRanks.sort((a, b) => b.handRank - a.handRank);
  
  // Определяем победителя(ей) - находим всех игроков с высшим рангом
  const winners = [playersWithHandRanks[0]];
  for (let i = 1; i < playersWithHandRanks.length; i++) {
    if (playersWithHandRanks[i].handRank === winners[0].handRank) {
      // Если равные комбинации, сравниваем по старшей карте
      if (winners[0].bestCards[0].value === playersWithHandRanks[i].bestCards[0].value) {
        winners.push(playersWithHandRanks[i]);
      }
    } else {
      // Остальные игроки имеют более слабые комбинации
      break;
    }
  }
  
  // Если несколько победителей, делим банк поровну
  const winnerShare = Math.floor(game.pot / winners.length);
  
  winners.forEach(winner => {
    game.players[winner.playerIndex].chips += winnerShare;
  });
  
  // Добавляем информацию о выигрышных картах каждому игроку
  playersWithHandRanks.forEach(playerData => {
    const playerIndex = playerData.playerIndex;
    game.players[playerIndex].winningCards = playerData.bestCards;
    game.players[playerIndex].handRank = playerData.handRank;
    game.players[playerIndex].handName = playerData.handName;
  });
  
  // Обновляем данные игры
  game.pot = 0;
  game.status = 'finished';
  
  // ИСПРАВЛЕНО: Устанавливаем showdown когда игра дошла до вскрытия с несколькими игроками
  game.showdown = activePlayers.length > 1;
  
  // Формируем строку с именами победителей
  game.winner = winners.map(w => w.player.username || 'Игрок ' + w.playerIndex).join(', ');
  game.winningHand = winners[0].handName;
  game.winningCombination = getCardDescriptions(winners[0].bestCards);
  
  console.log(`[ROUND] Победитель шоудауна: ${game.winner} с комбинацией ${game.winningHand}`);
  
  return game;
}

// Вспомогательные функции для определения комбинаций

// Роял-флеш (10, J, Q, K, A одной масти)
function isRoyalFlush(cards) {
  const flush = isFlush(cards);
  if (!flush.found) return { found: false };
  
  const straightFlush = isStraightFlush(cards);
  if (!straightFlush.found) return { found: false };
  
  // Проверяем, что старшая карта - туз
  if (straightFlush.cards[0].value === 14) {
    return { found: true, cards: straightFlush.cards };
  }
  
  return { found: false };
}

// Стрит-флеш (5 последовательных карт одной масти)
function isStraightFlush(cards) {
  const flush = isFlush(cards);
  if (!flush.found) return { found: false };
  
  const flushCards = flush.cards;
  const straight = isStraight(flushCards);
  
  if (straight.found) {
    return { found: true, cards: straight.cards };
  }
  
  return { found: false };
}

// Каре (4 карты одного достоинства)
function isFourOfAKind(cards) {
  // Группируем карты по значению
  const groups = {};
  cards.forEach(card => {
    if (!groups[card.value]) groups[card.value] = [];
    groups[card.value].push(card);
  });
  
  // Ищем группу из 4 карт
  for (const value in groups) {
    if (groups[value].length === 4) {
      // Находим лучшую пятую карту (кикер)
      const kickers = cards.filter(card => card.value != value);
      return { found: true, cards: [...groups[value], kickers[0]] };
    }
  }
  
  return { found: false };
}

// Фулл-хаус (3 карты одного достоинства + 2 карты другого достоинства)
function isFullHouse(cards) {
  // Группируем карты по значению
  const groups = {};
  cards.forEach(card => {
    if (!groups[card.value]) groups[card.value] = [];
    groups[card.value].push(card);
  });
  
  let threeOfAKind = null;
  let pair = null;
  
  // Ищем тройку и пару
  for (const value in groups) {
    if (groups[value].length >= 3 && !threeOfAKind) {
      threeOfAKind = groups[value].slice(0, 3);
    } else if (groups[value].length >= 2 && !pair) {
      pair = groups[value].slice(0, 2);
    }
  }
  
  if (threeOfAKind && pair) {
    return { found: true, cards: [...threeOfAKind, ...pair] };
  }
  
  return { found: false };
}

// Флеш (5 карт одной масти)
function isFlush(cards) {
  // Группируем карты по масти
  const suits = {};
  cards.forEach(card => {
    if (!suits[card.suit]) suits[card.suit] = [];
    suits[card.suit].push(card);
  });
  
  // Ищем группу из 5+ карт одной масти
  for (const suit in suits) {
    if (suits[suit].length >= 5) {
      return { found: true, cards: suits[suit].slice(0, 5) };
    }
  }
  
  return { found: false };
}

// Стрит (5 последовательных карт)
function isStraight(cards) {
  // Удаляем дубликаты по значению
  const uniqueValues = [];
  const seen = {};
  
  cards.forEach(card => {
    if (!seen[card.value]) {
      seen[card.value] = true;
      uniqueValues.push(card);
    }
  });
  
  // Сортируем уникальные значения
  uniqueValues.sort((a, b) => b.value - a.value);
  
  // Проверяем каждую возможную начальную позицию для стрита
  for (let i = 0; i < uniqueValues.length - 4; i++) {
    if (uniqueValues[i].value - uniqueValues[i + 4].value === 4) {
      return { found: true, cards: uniqueValues.slice(i, i + 5) };
    }
  }
  
  // Проверка на стрит от 5 до туза (A-5-4-3-2)
  if (
    uniqueValues.some(card => card.value === 14) && // Есть туз
    uniqueValues.some(card => card.value === 2) && 
    uniqueValues.some(card => card.value === 3) && 
    uniqueValues.some(card => card.value === 4) && 
    uniqueValues.some(card => card.value === 5)
  ) {
    // Собираем карты для A-5-4-3-2
    const aceToFive = [
      uniqueValues.find(card => card.value === 14),
      uniqueValues.find(card => card.value === 5),
      uniqueValues.find(card => card.value === 4),
      uniqueValues.find(card => card.value === 3),
      uniqueValues.find(card => card.value === 2)
    ];
    
    return { found: true, cards: aceToFive };
  }
  
  return { found: false };
}

// Тройка (3 карты одного достоинства)
function isThreeOfAKind(cards) {
  // Группируем карты по значению
  const groups = {};
  cards.forEach(card => {
    if (!groups[card.value]) groups[card.value] = [];
    groups[card.value].push(card);
  });
  
  // Ищем группу из 3 карт
  for (const value in groups) {
    if (groups[value].length === 3) {
      // Находим лучшие две другие карты (кикеры)
      const kickers = cards
        .filter(card => card.value != value)
        .slice(0, 2);
      
      return { found: true, cards: [...groups[value], ...kickers] };
    }
  }
  
  return { found: false };
}

// Две пары
function isTwoPairs(cards) {
  // Группируем карты по значению
  const groups = {};
  cards.forEach(card => {
    if (!groups[card.value]) groups[card.value] = [];
    groups[card.value].push(card);
  });
  
  const pairs = [];
  
  // Ищем пары
  for (const value in groups) {
    if (groups[value].length >= 2) {
      pairs.push(groups[value].slice(0, 2));
    }
  }
  
  if (pairs.length >= 2) {
    // Сортируем пары от самой высокой к самой низкой
    pairs.sort((a, b) => b[0].value - a[0].value);
    
    // Выбираем две старшие пары
    const topPairs = [].concat(pairs[0], pairs[1]);
    
    // Находим лучшую пятую карту (кикер)
    const usedValues = [pairs[0][0].value, pairs[1][0].value];
    const kicker = cards.find(card => !usedValues.includes(card.value));
    
    return { found: true, cards: [...topPairs, kicker] };
  }
  
  return { found: false };
}

// Одна пара
function isOnePair(cards) {
  // Группируем карты по значению
  const groups = {};
  cards.forEach(card => {
    if (!groups[card.value]) groups[card.value] = [];
    groups[card.value].push(card);
  });
  
  // Ищем пару
  for (const value in groups) {
    if (groups[value].length === 2) {
      // Находим лучшие три другие карты (кикеры)
      const kickers = cards
        .filter(card => card.value != value)
        .slice(0, 3);
      
      return { found: true, cards: [...groups[value], ...kickers] };
    }
  }
  
  return { found: false };
}

// Функция для красивого описания карт
function getCardDescriptions(cards) {
  const valueMap = {
    '2': '2',
    '3': '3',
    '4': '4',
    '5': '5',
    '6': '6',
    '7': '7',
    '8': '8',
    '9': '9',
    '10': '10',
    '11': 'Валет',
    '12': 'Дама',
    '13': 'Король',
    '14': 'Туз'
  };
  
  const suitMap = {
    'hearts': '♥',
    'diamonds': '♦',
    'clubs': '♣',
    'spades': '♠'
  };
  
  return cards.map(card => {
    const valueName = card.original ? card.original : valueMap[card.value.toString()];
    const suitSymbol = suitMap[card.suit];
    return `${valueName}${suitSymbol}`;
  }).join(', ');
}

module.exports = {
  createDeck,
  shuffleDeck,
  dealCards,
  dealCommunityCards,
  nextRound,
  nextTurn,
  evaluateHand,
  determineWinner,
  validateGameCards
}; 