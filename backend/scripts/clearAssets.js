const { Asset } = require('../models');
const { sequelize } = require('../models');

async function clearAssets() {
  try {
    console.log('Clearing all assets...');

    // Delete all assets
    await Asset.destroy({
      where: {},
      truncate: true,
      cascade: true
    });

    // Reset the sequence
    await sequelize.query('ALTER SEQUENCE assets_id_seq RESTART WITH 1');

    console.log('✓ All assets cleared successfully');
    console.log('✓ ID sequence reset to 1');

    process.exit(0);
  } catch (error) {
    console.error('Error clearing assets:', error);
    process.exit(1);
  }
}

clearAssets();
