const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PokerGame = sequelize.define('PokerGame', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
  type: {
      type: DataTypes.STRING,
      defaultValue: 'poker',
      allowNull: false
    },
    players: {
      type: DataTypes.JSON,
      defaultValue: []
    },
    pot: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    deck: {
      type: DataTypes.JSON,
      defaultValue: []
    },
  status: {
      type: DataTypes.ENUM('waiting', 'playing', 'finished', 'eliminated', 'replaced'),
      defaultValue: 'waiting'
  },
  settings: {
      type: DataTypes.JSON,
      defaultValue: {
        maxPlayers: 4,
        smallBlind: 10,
        bigBlind: 20
      }
  },
    winner: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null
    },
    showdown: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'user_id',
      references: {
        model: 'users',
        key: 'id'
      }
    }
  }, {
    tableName: 'poker_games',
    timestamps: false,
    underscored: false,
    hooks: {
      // Hook для проверки уникальности карт перед сохранением
      beforeSave: (game, options) => {
        if (game.players && game.players.length > 0) {
          const allCards = new Set();
          const duplicates = [];
          
          // Проверяем карты игроков
          for (let i = 0; i < game.players.length; i++) {
            const player = game.players[i];
            if (player.cards && Array.isArray(player.cards)) {
              for (const card of player.cards) {
                if (card && card.value && card.suit) {
                  const cardKey = `${card.value}-${card.suit}`;
                  if (allCards.has(cardKey)) {
                    duplicates.push(`Игрок ${i} (${player.username}): ${cardKey}`);
                  } else {
                    allCards.add(cardKey);
                  }
                }
              }
            }
          }
          
          // Проверяем общие карты
          if (game.settings && game.settings.communityCards && Array.isArray(game.settings.communityCards)) {
            for (const card of game.settings.communityCards) {
              if (card && card.value && card.suit) {
                const cardKey = `${card.value}-${card.suit}`;
                if (allCards.has(cardKey)) {
                  duplicates.push(`Общие карты: ${cardKey}`);
                } else {
                  allCards.add(cardKey);
                }
              }
            }
          }
          
          if (duplicates.length > 0) {
            console.error(`[MODEL] ❌ КРИТИЧЕСКАЯ ОШИБКА: Дубликаты карт при сохранении игры ${game.id}:`, duplicates);
            throw new Error(`Дубликаты карт обнаружены: ${duplicates.join(', ')}`);
          } else {
            console.log(`[MODEL] ✅ Проверка карт в модели прошла успешно. Всего карт: ${allCards.size}`);
          }
        }
      }
    }
  });

  // Связи с другими моделями
  PokerGame.associate = function(models) {
    // PokerGame принадлежит пользователю
    PokerGame.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user'
    });
  };

  return PokerGame;
}; 