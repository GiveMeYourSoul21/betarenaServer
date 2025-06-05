const express = require('express');
const cors = require('cors');
const { connectDB, sequelize } = require('./server/config/database');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors({
  origin: function (origin, callback) {
    // Разрешить запросы без origin (например, мобильные приложения)
    if (!origin) return callback(null, true);
    
    // Список разрешенных origins
    const allowedOrigins = [
      'http://localhost:3000', 
      'http://127.0.0.1:3000',
      'https://betarena-qgjfivg8y-skills-projects-fff77d72.vercel.app',
      'https://bet2arena123.vercel.app'
    ];
    
    // Проверка на Vercel поддомены
    const isVercelDomain = origin.includes('.vercel.app');
    const isBetArenaDomain = origin.includes('bet') && origin.includes('arena');
    
    if (allowedOrigins.includes(origin) || (isVercelDomain && isBetArenaDomain)) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Дополнительная обработка preflight запросов
app.options('*', (req, res) => {
  console.log('🔧 OPTIONS request from:', req.headers.origin);
  res.header('Access-Control-Allow-Origin', req.headers.origin);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});

// Логирование всех запросов для отладки
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.path} from ${req.headers.origin || 'unknown'}`);
  next();
});

// Routes
app.use('/api/auth', require('./server/routes/auth'));
app.use('/api/users', require('./server/routes/user'));
app.use('/api/poker', require('./server/routes/poker'));
app.use('/api/blackjack', require('./server/routes/blackjack'));
app.use('/api/games', require('./server/routes/game'));
app.use('/api/game', require('./server/routes/game'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
    port: PORT,
    cors: 'enabled'
  });
});

// Тестовый endpoint для проверки CORS
app.get('/api/test-cors', (req, res) => {
  res.json({ 
    message: 'CORS working!', 
    origin: req.headers.origin,
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  
  // Обработка CORS ошибок
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ 
      error: 'CORS Error',
      message: 'Origin not allowed by CORS policy',
      origin: req.headers.origin
    });
  }
  
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: err.message 
  });
});

// Start server
const startServer = async () => {
  try {
    // Connect to database
    await connectDB();
    console.log('✅ Database connected successfully');
    
    // Sync database
    await sequelize.sync();
    console.log('✅ Database synchronized');
    
    // Start listening
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📡 API available at: http://localhost:${PORT}/api`);
      console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer(); 