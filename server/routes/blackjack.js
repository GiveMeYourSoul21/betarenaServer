const express = require('express');
const router = express.Router();
const blackjackController = require('../controllers/blackjackController');

// Создание новой игры в блэкджек
router.post('/create', blackjackController.createGame);

// Получение данных игры
router.get('/:gameId', blackjackController.getGame);

// Действия игрока
router.post('/:gameId/hit', blackjackController.hit);
router.post('/:gameId/stand', blackjackController.stand);

module.exports = router; 