const express = require('express');
const router = express.Router();
const { User, PokerGame } = require('../models');
const auth = require('../middleware/auth');

console.log('User routes loaded'); // Добавляем лог загрузки роутера

// Логируем все запросы к роутеру пользователя
router.use((req, res, next) => {
  console.log(`User route accessed: ${req.method} ${req.url}`);
  next();
});

/**
 * @route   GET /api/users/profile
 * @desc    Отримання профілю поточного користувача
 * @access  Private
 */
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password'] }
    });
    
    if (!user) {
      return res.status(404).json({ message: 'Користувач не знайдений' });
    }
    
    res.status(200).json(user);
  } catch (error) {
    console.error('Помилка при отриманні профілю:', error);
    res.status(500).json({ message: 'Помилка сервера' });
  }
});

/**
 * @route   PUT /api/users/profile
 * @desc    Оновлення профілю користувача
 * @access  Private
 */
router.put('/profile', auth, async (req, res) => {
  try {
    const { username, email } = req.body;
    
    // Перевіряємо, чи зайняте вже таке ім'я користувача іншим користувачем
    if (username) {
      const existingUser = await User.findOne({ 
        where: { 
          username, 
          id: { [require('sequelize').Op.ne]: req.user.id } 
        } 
      });
      if (existingUser) {
        return res.status(400).json({ message: 'Це ім\'я користувача вже зайняте' });
      }
    }
    
    // Перевіряємо, чи зайнятий вже такий email іншим користувачем
    if (email) {
      const existingUser = await User.findOne({ 
        where: { 
          email, 
          id: { [require('sequelize').Op.ne]: req.user.id } 
        } 
      });
      if (existingUser) {
        return res.status(400).json({ message: 'Цей email вже зайнятий' });
      }
    }
    
    // Оновлюємо профіль
    const updateData = {};
    if (username) updateData.username = username;
    if (email) updateData.email = email;
    
    const [updatedRowsCount] = await User.update(updateData, {
      where: { id: req.user.id },
      returning: true
    });
    
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password'] }
    });
    
    res.status(200).json(user);
  } catch (error) {
    console.error('Помилка при оновленні профілю:', error);
    res.status(500).json({ message: 'Помилка сервера' });
  }
});

/**
 * @route   GET /api/users/chips
 * @desc    Отримання кількості фішок користувача
 * @access  Private
 */
router.get('/chips', auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    
    if (!user) {
      return res.status(404).json({ message: 'Користувач не знайдений' });
    }
    
    res.status(200).json({ chips: user.chips });
  } catch (error) {
    console.error('Помилка при отриманні фішок:', error);
    res.status(500).json({ message: 'Помилка сервера' });
  }
});

/**
 * @route   PUT /api/users/chips
 * @desc    Оновлення кількості фішок користувача
 * @access  Private
 */
router.put('/chips', auth, async (req, res) => {
  try {
    const { chips } = req.body;
    
    if (typeof chips !== 'number' || chips < 0) {
      return res.status(400).json({ message: 'Недопустима кількість фішок' });
    }
    
    await User.update({ chips }, {
      where: { id: req.user.id }
    });
    
    const user = await User.findByPk(req.user.id);
    
    if (!user) {
      return res.status(404).json({ message: 'Користувач не знайдений' });
    }
    
    res.status(200).json({ chips: user.chips });
  } catch (error) {
    console.error('Помилка при оновленні фішок:', error);
    res.status(500).json({ message: 'Помилка сервера' });
  }
});

/**
 * @route   GET /api/users/statistics
 * @desc    Отримання статистики користувача
 * @access  Private
 */
router.get('/statistics', auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    
    if (!user) {
      return res.status(404).json({ message: 'Користувач не знайдений' });
    }
    
    // Збираємо додаткову статистику (останні ігри і т.д.)
    const recentGames = await PokerGame.findAll({
      where: {
        '$players.user$': req.user.id,
      status: 'finished'
      },
      order: [['createdAt', 'DESC']],
      limit: 5
    });
    
    const statistics = {
      ...user.statistics,
      recentGames: recentGames.map(game => ({
        id: game.id,
        date: game.createdAt,
        result: game.winner?.includes(user.username) ? 'win' : 'loss',
        pot: game.pot
      }))
    };
    
    res.status(200).json(statistics);
  } catch (error) {
    console.error('Помилка при отриманні статистики:', error);
    res.status(500).json({ message: 'Помилка сервера' });
  }
});

/**
 * @route   PUT /api/users/password
 * @desc    Зміна пароля користувача
 * @access  Private
 */
router.put('/password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    // Перевіряємо, чи вказані всі необхідні поля
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Необхідно вказати поточний та новий пароль' });
    }
    
    // Отримуємо користувача з БД (з паролем)
    const user = await User.findByPk(req.user.id);
    
    if (!user) {
      return res.status(404).json({ message: 'Користувач не знайдений' });
    }
    
    // Перевіряємо поточний пароль
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: 'Невірний поточний пароль' });
    }
    
    // Перевіряємо вимоги до нового пароля
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Новий пароль повинен містити не менше 6 символів' });
    }
    
    // Оновлюємо пароль
    user.password = newPassword;
    await user.save(); // Пароль буде хешуватися в beforeSave hook
    
    res.status(200).json({ message: 'Пароль успішно оновлено' });
  } catch (error) {
    console.error('Помилка при зміні пароля:', error);
    res.status(500).json({ message: 'Помилка сервера' });
  }
});

/**
 * @route   GET /api/users/games
 * @desc    Отримання історії ігор користувача
 * @access  Private
 */
router.get('/games', auth, async (req, res) => {
  try {
    const games = await PokerGame.findAll({
      where: {
        '$players.user$': req.user.id
      },
      order: [['createdAt', 'DESC']]
    });
    
    // Форматуємо результати для більш зручного відображення
    const formattedGames = games.map(game => ({
      id: game.id,
      date: game.createdAt,
      status: game.status,
      players: game.players.length,
      isWinner: game.winner?.includes(req.user.username),
      pot: game.pot,
      winningHand: game.winningHand
    }));
    
    res.status(200).json(formattedGames);
  } catch (error) {
    console.error('Помилка при отриманні історії ігор:', error);
    res.status(500).json({ message: 'Помилка сервера' });
  }
});

/**
 * @route   POST /api/users/bonus
 * @desc    Отримання щоденного бонусу
 * @access  Private
 */
router.post('/bonus', auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    
    if (!user) {
      return res.status(404).json({ message: 'Користувач не знайдений' });
    }
    
    const now = new Date();
    const lastBonus = user.lastBonus;
    
    // Перевіряємо, чи пройшло 24 години з останнього бонусу
    if (lastBonus) {
      const timeDiff = now - lastBonus;
      const hoursDiff = timeDiff / (1000 * 60 * 60);
      
      if (hoursDiff < 24) {
        const hoursLeft = Math.ceil(24 - hoursDiff);
        return res.status(400).json({ 
          message: `Наступний бонус буде доступний через ${hoursLeft} годин` 
        });
      }
    }
    
    // Додаємо бонус
    const bonusAmount = 100;
    user.chips += bonusAmount;
    user.lastBonus = now;
    
    await user.save();
    
    res.status(200).json({
      message: `Ви отримали щоденний бонус: ${bonusAmount} фішок!`,
      chips: user.chips,
      bonus: bonusAmount
    });
  } catch (error) {
    console.error('Помилка при отриманні бонусу:', error);
    res.status(500).json({ message: 'Помилка сервера' });
  }
});

/**
 * @route   DELETE /api/users/delete
 * @desc    Видалення облікового запису користувача
 * @access  Private
 */
router.delete('/delete', auth, async (req, res) => {
  try {
    console.log(`[DELETE-USER] Починаємо видалення користувача ID: ${req.user.id}`);
    
    const user = await User.findByPk(req.user.id);
    
    if (!user) {
      console.log(`[DELETE-USER] Користувач не знайдений: ID ${req.user.id}`);
      return res.status(404).json({ message: 'Користувач не знайдений' });
    }
    
    console.log(`[DELETE-USER] Користувач знайдений: ${user.username}`);
    
    // ВИПРАВЛЕНО: Отримуємо всі ігри де користувач є user_id (основний власник)
    const userGames = await PokerGame.findAll({
      where: {
        user_id: req.user.id
      }
    });
    
    console.log(`[DELETE-USER] Знайдено ${userGames.length} ігор користувача`);
    
    // Видаляємо ігри користувача
    if (userGames.length > 0) {
      await PokerGame.destroy({
        where: {
          user_id: req.user.id
        }
      });
      console.log(`[DELETE-USER] Видалено ${userGames.length} ігор`);
    }
    
    // ДОДАТКОВО: Видаляємо блекджек ігри якщо вони є
    try {
      const { BlackjackGame } = require('../models');
      if (BlackjackGame) {
        const blackjackGames = await BlackjackGame.findAll({
          where: {
            userId: req.user.id
          }
        });
        
        console.log(`[DELETE-USER] Знайдено ${blackjackGames.length} блекджек ігор`);
        
        if (blackjackGames.length > 0) {
          await BlackjackGame.destroy({
            where: {
              userId: req.user.id
            }
          });
          console.log(`[DELETE-USER] Видалено ${blackjackGames.length} блекджек ігор`);
        }
      }
    } catch (blackjackError) {
      console.log(`[DELETE-USER] Блекджек модель не знайдена або помилка:`, blackjackError.message);
    }
    
    // Видаляємо користувача
    await User.destroy({
      where: { id: req.user.id }
    });
    
    console.log(`[DELETE-USER] ✅ Користувач ${user.username} успішно видалений`);
    
    res.status(200).json({ 
      message: 'Обліковий запис успішно видалено' 
    });
  } catch (error) {
    console.error('[DELETE-USER] ❌ Помилка при видаленні облікового запису:', error);
    res.status(500).json({ message: 'Помилка сервера: ' + error.message });
  }
});

module.exports = router; 