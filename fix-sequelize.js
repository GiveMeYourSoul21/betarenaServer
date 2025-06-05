const fs = require('fs');

const filePath = 'server/routes/poker.js';
let content = fs.readFileSync(filePath, 'utf8');

// Замінюємо await game.save() на блок з markAsChanged
const pattern = /(\s*)(await game\.save\(\);)/g;
const replacement = `$1// КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Явно помечаем JSON поля как измененные для Sequelize
$1game.changed('players', true);
$1game.changed('pot', true);
$1game.changed('settings', true);
$1
$1$2`;

content = content.replace(pattern, replacement);

// Також замінюємо await freshGame.save()
const pattern2 = /(\s*)(await freshGame\.save\(\);)/g;
const replacement2 = `$1// КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Явно помечаем JSON поля как измененные для Sequelize
$1freshGame.changed('players', true);
$1freshGame.changed('pot', true);
$1freshGame.changed('settings', true);
$1
$1$2`;

content = content.replace(pattern2, replacement2);

fs.writeFileSync(filePath, content);
console.log('✅ Автоматично додано markAsChanged перед всіма game.save() та freshGame.save()');
console.log('🔧 Файл server/routes/poker.js оновлено'); 