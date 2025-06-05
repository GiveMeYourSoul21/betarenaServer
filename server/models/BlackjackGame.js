const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const BlackjackGame = sequelize.define('BlackjackGame', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'blackjack'
  },
  players: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: []
  },
  deck: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: []
  },
  pot: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'waiting'
  },
  settings: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {}
  },
  winner: {
    type: DataTypes.STRING,
    allowNull: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'user_id'
  }
}, {
  tableName: 'poker_games', // Используем ту же таблицу
  timestamps: false, // Отключаем timestamps так как их нет в таблице
  underscored: false // Явно отключаем автоматическое преобразование имен
});

module.exports = BlackjackGame; 