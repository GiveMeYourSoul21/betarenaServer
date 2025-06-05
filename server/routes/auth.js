const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { Op } = require('sequelize');

// Створення JWT
const createToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '24h' }
  );
};

/**
 * @route   POST /api/auth/register
 * @desc    Реєстрація нового користувача
 * @access  Public
 */
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Валидация данных
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Усі поля обов\'язкові для заповнення' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ message: 'Пароль повинен містити не менше 6 символів' });
    }
    
    if (username.length < 3) {
      return res.status(400).json({ message: 'Ім\'я користувача повинно містити не менше 3 символів' });
    }
    
    // Перевірка, чи існує вже користувач
    const existingUser = await User.findOne({ 
      where: {
        [Op.or]: [{ email }, { username }]
      }
    });
    
    if (existingUser) {
      return res.status(400).json({ message: 'Користувач з таким email або іменем вже існує' });
    }
    
    // Створення нового користувача
    const user = await User.create({
      username,
      email,
      password
    });
    
    // Створення та надсилання токена
    const token = createToken(user.id);
    
    // Надсилаємо відповідь
    res.status(201).json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        chips: user.chips
      }
    });
  } catch (error) {
    console.error('Помилка при реєстрації:', error);
    
    // Обработка ошибок валидации Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map(err => err.message);
      return res.status(400).json({ message: messages.join('. ') });
    }
    
    // Обработка дублирования уникальных полей
    if (error.name === 'SequelizeUniqueConstraintError') {
      const field = error.errors[0]?.path;
      const fieldTranslations = {
        email: 'Email',
        username: 'Ім\'я користувача'
      };
      return res.status(400).json({ 
        message: `${fieldTranslations[field] || field} вже використовується` 
      });
    }
    
    res.status(500).json({ message: 'Помилка сервера' });
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    Вхід в систему
 * @access  Public
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Пошук користувача
    const user = await User.findOne({ where: { email } });
    
    // Якщо користувач не знайдений
    if (!user) {
      return res.status(401).json({ message: 'Невірні облікові дані' });
    }
    
    // Перевірка пароля
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Невірні облікові дані' });
    }
    
    // Створення та надсилання токена
    const token = createToken(user.id);
    
    // Надсилаємо відповідь
    res.status(200).json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        chips: user.chips
      }
    });
  } catch (error) {
    console.error('Помилка при вході:', error);
    res.status(500).json({ message: 'Помилка сервера' });
  }
});

/**
 * @route   GET /api/auth/me
 * @desc    Отримання даних поточного користувача
 * @access  Private
 */
router.get('/me', async (req, res) => {
  try {
    // Отримуємо JWT з заголовка
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'Не авторизований' });
    }
    
    // Перевіряємо JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    // Отримуємо користувача
    const user = await User.findByPk(decoded.userId, {
      attributes: { exclude: ['password'] }
    });
    
    if (!user) {
      return res.status(404).json({ message: 'Користувач не знайдений' });
    }
    
    // Надсилаємо дані користувача
    res.status(200).json(user);
  } catch (error) {
    console.error('Помилка при отриманні даних користувача:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Недійсний токен' });
    }
    
    res.status(500).json({ message: 'Помилка сервера' });
  }
});

module.exports = router; 