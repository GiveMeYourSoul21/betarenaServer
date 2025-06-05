const fs = require('fs');

const filePath = 'server/routes/poker.js';
let content = fs.readFileSync(filePath, 'utf8');

// Знаходимо рядок з деструктуризацією { userId, username }
const oldPattern = 'const { userId, username } = req.body;';
const newCode = `const { userId } = req.body;
    
    // Получаем данные пользователя из базы данных
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }
    
    const username = user.username;
    console.log('Получен username из базы:', username);`;

content = content.replace(oldPattern, newCode);

fs.writeFileSync(filePath, content);
console.log('✅ Додано отримання username з бази даних');
console.log('🔧 Файл server/routes/poker.js оновлено'); 