const jwt = require('jsonwebtoken');
const { User } = require('../models');

/**
 * Middleware для перевірки аутентифікації
 */
const auth = async (req, res, next) => {
  try {
    // Получаем токен из заголовка
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Токен доступу не надано' });
    }
    
    const token = authHeader.split(' ')[1];
    
    // Проверяем токен
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    // Находим пользователя
    const user = await User.findByPk(decoded.userId, {
      attributes: { exclude: ['password'] }
    });
    
    if (!user) {
      return res.status(401).json({ message: 'Користувач не знайдений' });
    }
    
    // Добавляем пользователя в объект запроса
    req.user = user;
    next();
  } catch (error) {
    console.error('Помилка аутентифікації:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Недійсний токен' });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Термін дії токена закінчився' });
    }
    
    res.status(500).json({ message: 'Помилка сервера при аутентифікації' });
  }
};

module.exports = auth; 