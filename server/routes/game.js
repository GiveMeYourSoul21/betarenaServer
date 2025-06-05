const express = require('express');
const router = express.Router();
const pokerController = require('../controllers/pokerController');
const blackjackController = require('../controllers/blackjackController');

// Создание новой игры
router.post('/create', async (req, res) => {
  try {
    console.log('[GAME-ROUTE] Создание игры, тело запроса:', req.body);
    const { type, userId, username } = req.body;
    
    // ИСПРАВЛЕНО: Добавляем значения по умолчанию если клиент их не передал
    if (!userId) {
      req.body.userId = username || 'Игрок';
    }
    if (!username) {
      req.body.username = userId || 'Игрок';
    }
    
    console.log('[GAME-ROUTE] После обработки:', req.body);
    
    if (type === 'blackjack') {
      // Перенаправляем на контроллер блэкджека
      return await blackjackController.createGame(req, res);
    } else {
      // По умолчанию покер
      return await pokerController.createGame(req, res);
    }
  } catch (error) {
    console.error('Ошибка при создании игры:', error);
    res.status(500).json({ message: 'Ошибка при создании игры' });
  }
});

// Получение данных игры
router.get('/:gameId', pokerController.getGame);

// Начало игры
router.post('/:gameId/start', pokerController.startGame);

// Выход из игры
router.post('/:gameId/exit', pokerController.exitGame);

// Получение типа игры
router.get('/:gameId/type', pokerController.getGameType);

module.exports = router; 