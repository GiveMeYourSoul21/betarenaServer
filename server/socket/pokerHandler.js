const PokerGame = require('../models/PokerGame');

module.exports = function(io) {
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Присоединение к игре
    socket.on('joinGame', async (gameId) => {
      try {
        console.log(`Client ${socket.id} joining game ${gameId}`);
        socket.join(gameId);
        
        // Получаем текущее состояние игры
        const game = await PokerGame.findById(gameId);
        if (game) {
          // Отправляем текущее состояние игры всем в комнате
          io.to(gameId).emit('gameUpdate', game);
        }
      } catch (error) {
        console.error('Error joining game:', error);
        socket.emit('error', { message: 'Failed to join game' });
      }
    });

    // Обработка ставок и действий игроков
    socket.on('playerAction', async ({ gameId, playerId, action, amount }) => {
      try {
        const game = await PokerGame.findById(gameId);
        if (!game) {
          socket.emit('error', { message: 'Game not found' });
          return;
        }

        // Находим игрока
        const player = game.players.find(p => p.user && p.user.toString() === playerId);
        if (!player) {
          socket.emit('error', { message: 'Player not found' });
          return;
        }

        // Проверяем, может ли игрок сделать ход
        if (!game.canPlayerAct(player.position)) {
          socket.emit('error', { message: 'Not your turn' });
          return;
        }

        // Обновляем состояние игры в зависимости от действия
        switch (action) {
          case 'bet':
            if (amount <= 0 || amount > player.chips) {
              socket.emit('error', { message: 'Invalid bet amount' });
              return;
            }
            player.chips -= amount;
            player.currentBet += amount;
            game.pot += amount;
            break;

          case 'fold':
            player.folded = true;
            break;

          case 'call':
            const maxBet = Math.max(...game.players.map(p => p.currentBet));
            const callAmount = maxBet - player.currentBet;
            if (callAmount > player.chips) {
              // Если у игрока не хватает фишек - идет в олл-ин
              game.pot += player.chips;
              player.currentBet += player.chips;
              player.chips = 0;
              player.isAllIn = true;
            } else {
              game.pot += callAmount;
              player.chips -= callAmount;
              player.currentBet = maxBet;
            }
            break;

          case 'check':
            // Проверяем, может ли игрок сделать чек
            const currentMaxBet = Math.max(...game.players.map(p => p.currentBet));
            if (currentMaxBet > player.currentBet) {
              socket.emit('error', { message: 'Cannot check, must call or fold' });
              return;
            }
            break;

          default:
            socket.emit('error', { message: 'Invalid action' });
            return;
        }

        // Отмечаем, что игрок сделал ход
        player.hasActed = true;

        // Проверяем, завершен ли текущий раунд торговли
        const allPlayersActed = game.players.every(p => 
          p.hasActed || p.folded || p.isAllIn
        );
        const allBetsEqual = new Set(
          game.players
            .filter(p => !p.folded && !p.isAllIn)
            .map(p => p.currentBet)
        ).size <= 1;

        if (allPlayersActed && allBetsEqual) {
          // Если все сделали ход и все ставки равны, переходим к следующему раунду
          game.moveToNextRound();
        } else {
          // Иначе передаем ход следующему игроку
          game.moveToNextPlayer();
        }

        // Сохраняем обновленное состояние
        await game.save();

        // Отправляем обновление всем игрокам
        io.to(gameId).emit('gameUpdate', game);

      } catch (error) {
        console.error('Error processing player action:', error);
        socket.emit('error', { message: 'Failed to process action' });
      }
    });

    // Отключение
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
}; 