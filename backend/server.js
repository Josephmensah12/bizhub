require('dotenv').config();
const app = require('./app');
const db = require('./models');

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Test database connection
async function testDatabaseConnection() {
  try {
    await db.sequelize.authenticate();
    console.log('✓ Database connection established successfully');
    return true;
  } catch (error) {
    console.error('✗ Unable to connect to the database:', error.message);
    return false;
  }
}

// Start server
async function startServer() {
  // Test database connection first
  const dbConnected = await testDatabaseConnection();

  if (!dbConnected && NODE_ENV === 'production') {
    console.error('Cannot start server without database connection in production');
    process.exit(1);
  }

  if (dbConnected) {
    try {
      await db.sequelize.sync({ alter: true });
      console.log('✅ Database schema synced');
    } catch (err) {
      console.error('⚠️ Schema sync FAILED:', err.message);
      console.error('Full error:', err);
    }
  }

  // Start listening
  const server = app.listen(PORT, () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  BIZHUB API Server');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Environment: ${NODE_ENV}`);
    console.log(`  Port: ${PORT}`);
    console.log(`  API Base: http://localhost:${PORT}/api/v1`);
    console.log(`  Health: http://localhost:${PORT}/health`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
      console.log('HTTP server closed');
      db.sequelize.close();
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('\nSIGINT signal received: closing HTTP server');
    server.close(() => {
      console.log('HTTP server closed');
      db.sequelize.close();
      process.exit(0);
    });
  });
}

startServer();
