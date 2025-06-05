const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME || 'defaultdb',
  process.env.DB_USER || 'avnadmin',
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST || 'mysql-28d88054-yaroslavppi27-5d38.g.aivencloud.com',
    port: process.env.DB_PORT || 19164,
    dialect: 'mysql',
    dialectOptions: {
      ssl: process.env.DB_SSL === 'true' ? {
        require: true,
        rejectUnauthorized: false
      } : false,
      connectTimeout: 60000,
      dateStrings: true,
      typeCast: true
    },
    pool: {
      max: 5,
      min: 0,
      acquire: 60000,
      idle: 10000
    },
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    define: {
      timestamps: true,
      underscored: false,
    },
    timezone: '+03:00' // Киевское время
  }
);

// Тест подключения
const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Подключение к MySQL (Aiven.io) установлено успешно!');
    
    // Синхронизация моделей с force: false для безопасности
    await sequelize.sync({ force: false, alter: false }); // БЕЗОПАСНЫЕ настройки восстановлены
    console.log('✅ Модели синхронизированы с базой данных');
  } catch (error) {
    console.error('❌ Ошибка подключения к базе данных:', error.message);
    throw error;
  }
};

module.exports = { sequelize, connectDB }; 