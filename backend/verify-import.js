const { sequelize } = require('./models');

async function verifyImport() {
  try {
    // Count total assets
    const [totalResult] = await sequelize.query('SELECT COUNT(*) as total FROM assets');
    const total = totalResult[0].total;
    
    console.log(`📊 Total assets in database: ${total}`);
    
    // Show sample assets
    const [assets] = await sequelize.query(`
      SELECT asset_tag, make, model, category, price_amount, cost_amount 
      FROM assets 
      LIMIT 5
    `);
    
    console.log('\n📦 Sample imported assets:');
    assets.forEach(asset => {
      console.log(`   ${asset.asset_tag}: ${asset.make} ${asset.model} - ₵${asset.price_amount} (cost: ₵${asset.cost_amount})`);
    });
    
    // Show breakdown by category
    const [categoryBreakdown] = await sequelize.query(`
      SELECT category, COUNT(*) as count 
      FROM assets 
      GROUP BY category
    `);
    
    console.log('\n📈 Breakdown by category:');
    categoryBreakdown.forEach(cat => {
      console.log(`   ${cat.category}: ${cat.count} items`);
    });
    
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
  }
}

verifyImport();