/**
 * Create Test User for Bizhub Login
 */

const bcrypt = require('bcrypt');
const { sequelize } = require('./models');

async function createTestUser() {
  try {
    console.log('🔧 Creating test user for Bizhub access...');
    
    // Create users table if it doesn't exist
    const createUserTableSQL = `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username VARCHAR(50) NOT NULL UNIQUE,
        email VARCHAR(100) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'Admin',
        full_name VARCHAR(100) NOT NULL,
        phone VARCHAR(20),
        is_active BOOLEAN DEFAULT 1,
        last_login DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    await sequelize.query(createUserTableSQL);
    console.log('✅ Users table created/verified');
    
    // Hash password
    const password = 'admin123';
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Insert test user
    const insertUserSQL = `
      INSERT OR REPLACE INTO users (
        id, username, email, password_hash, role, full_name, is_active
      ) VALUES (
        1, 'admin', 'admin@bizhub.local', ?, 'Admin', 'Test Administrator', 1
      )
    `;
    
    await sequelize.query(insertUserSQL, {
      replacements: [passwordHash]
    });
    
    console.log('✅ Test user created successfully!');
    console.log('📋 Login credentials:');
    console.log('   Username: admin');
    console.log('   Password: admin123');
    
    return { username: 'admin', password: 'admin123' };
    
  } catch (error) {
    console.error('❌ Error creating test user:', error.message);
    throw error;
  }
}

if (require.main === module) {
  createTestUser()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { createTestUser };