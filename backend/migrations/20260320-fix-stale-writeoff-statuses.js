'use strict';

/**
 * Fix assets where all units are Scrapped (written off) but the parent
 * asset status was never updated to 'Written Off'.
 */
module.exports = {
  async up(queryInterface) {
    const [result] = await queryInterface.sequelize.query(`
      UPDATE assets SET status = 'Written Off'
      WHERE is_serialized = true
        AND status NOT IN ('Written Off', 'Sold')
        AND deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM asset_units au
          WHERE au.asset_id = assets.id
            AND au.status NOT IN ('Sold', 'Scrapped')
        )
        AND EXISTS (
          SELECT 1 FROM asset_units au WHERE au.asset_id = assets.id
        )
      RETURNING id, asset_tag, status
    `);
    if (result.length > 0) {
      console.log(`Fixed ${result.length} assets to 'Written Off':`, result.map(r => r.asset_tag).join(', '));
    } else {
      console.log('No stale write-off statuses found.');
    }
  },

  async down() {
    // No reliable reversal — statuses were already wrong
  }
};
