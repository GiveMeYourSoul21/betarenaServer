const { sequelize } = require('../config/database');
const User = require('./User');
const PokerGame = require('./PokerGame');
const BlackjackGame = require('./BlackjackGame');

// Инициализация моделей
const models = {
  User: User(sequelize),
  PokerGame: PokerGame(sequelize),
  BlackjackGame
};

// Настройка связей между моделями
Object.keys(models).forEach(modelName => {
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});

// Экспорт моделей и sequelize
module.exports = {
  ...models,
  sequelize
}; 