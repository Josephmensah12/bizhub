const { sequelize } = require('../models');

/**
 * Generate next asset tag in format INV-000001
 * Thread-safe using database transaction with row locking
 */
async function generateAssetTag() {
  const transaction = await sequelize.transaction();

  try {
    // Get the last asset tag using raw query with row lock
    const result = await sequelize.query(
      `SELECT asset_tag FROM assets ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      { transaction, type: sequelize.QueryTypes.SELECT }
    );

    let nextNumber = 1;

    if (result.length > 0 && result[0].asset_tag) {
      // Extract number from last tag (e.g., INV-000123 -> 123)
      const lastTag = result[0].asset_tag;
      const match = lastTag.match(/INV-(\d+)/);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    // Format with leading zeros (6 digits)
    const newTag = `INV-${String(nextNumber).padStart(6, '0')}`;

    await transaction.commit();
    return newTag;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

module.exports = { generateAssetTag };
