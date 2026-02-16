/**
 * Create Assets Table for Inventory Import
 */

const { sequelize } = require('./models');

async function createAssetTable() {
  try {
    console.log('🏗️  Creating assets table for inventory import...');
    
    const sql = `
      CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_tag VARCHAR(20) UNIQUE NOT NULL,
        category VARCHAR(60) NOT NULL,
        asset_type VARCHAR(60) NOT NULL,
        serial_number VARCHAR(100) UNIQUE,
        status VARCHAR(20) NOT NULL DEFAULT 'In Stock',
        condition VARCHAR(20),
        quantity INTEGER DEFAULT 1 NOT NULL,
        quantity_reserved INTEGER DEFAULT 0 NOT NULL,
        quantity_sold INTEGER DEFAULT 0 NOT NULL,
        quantity_returned INTEGER DEFAULT 0 NOT NULL,
        
        -- Product details
        make VARCHAR(50) NOT NULL,
        model VARCHAR(100) NOT NULL,
        product_category VARCHAR(50),
        subcategory VARCHAR(50),
        specs TEXT,
        
        -- Technical specs
        ram_gb INTEGER,
        storage_gb INTEGER,
        storage_type VARCHAR(20),
        cpu VARCHAR(100),
        gpu VARCHAR(100),
        screen_size_inches DECIMAL(4,2),
        resolution VARCHAR(50),
        battery_health_percent INTEGER,
        major_characteristics TEXT, -- JSON as TEXT in SQLite
        
        -- Pricing
        cost_amount DECIMAL(10,2),
        cost_currency VARCHAR(3) DEFAULT 'GHS',
        price_amount DECIMAL(10,2),
        price_currency VARCHAR(3) DEFAULT 'GHS',
        
        -- Import tracking
        import_batch_id VARCHAR(50),
        salesbinder_id VARCHAR(50) UNIQUE,
        import_notes TEXT,
        
        -- Audit
        created_by INTEGER,
        updated_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        deleted_by INTEGER
      )
    `;
    
    await sequelize.query(sql);
    console.log('✅ Assets table created successfully!');
    
    // Test table exists
    const result = await sequelize.query("SELECT name FROM sqlite_master WHERE type='table' AND name='assets';");
    if (result[0].length > 0) {
      console.log('✅ Table verified - ready for inventory import!');
      return true;
    } else {
      console.log('❌ Table creation failed');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Error creating assets table:', error.message);
    return false;
  }
}

if (require.main === module) {
  createAssetTable()
    .then(success => {
      console.log('\n🎯 Ready for inventory import!');
      console.log('Run: node inventory-import.js');
      process.exit(success ? 0 : 1);
    });
}

module.exports = { createAssetTable };