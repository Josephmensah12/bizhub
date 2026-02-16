/**
 * Manual Customer Table Creation for Migration Testing
 */

const { sequelize } = require('./models');

async function createCustomerTable() {
  try {
    console.log('🏗️  Creating customers table manually...');
    
    const sql = `
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name VARCHAR(100),
        last_name VARCHAR(100),  
        company_name VARCHAR(200),
        phone_raw VARCHAR(50),
        phone_e164 VARCHAR(20),
        whatsapp_raw VARCHAR(50),
        whatsapp_e164 VARCHAR(20),
        whatsapp_same_as_phone BOOLEAN DEFAULT 0,
        email VARCHAR(255),
        email_lower VARCHAR(255),
        address TEXT,
        heard_about_us VARCHAR(50),
        heard_about_us_other_text VARCHAR(255),
        tags TEXT, -- JSON as TEXT in SQLite
        notes TEXT,
        salesbinder_id VARCHAR(50) UNIQUE,
        salesbinder_customer_number INTEGER,
        created_by INTEGER,
        updated_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    await sequelize.query(sql);
    console.log('✅ Customers table created successfully!');
    
    // Test table exists
    const result = await sequelize.query("SELECT name FROM sqlite_master WHERE type='table' AND name='customers';");
    if (result[0].length > 0) {
      console.log('✅ Table verified - ready for import!');
      return true;
    } else {
      console.log('❌ Table creation failed');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Error creating table:', error.message);
    return false;
  }
}

if (require.main === module) {
  createCustomerTable()
    .then(success => {
      if (success) {
        console.log('\n🎯 Ready to test import!');
        console.log('Run: node salesbinder-mass-migration.js --import');
      }
      process.exit(success ? 0 : 1);
    });
}

module.exports = { createCustomerTable };