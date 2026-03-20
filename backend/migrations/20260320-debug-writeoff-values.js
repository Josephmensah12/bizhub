'use strict';

/**
 * Debug migration: logs write-off data and fixes any remaining stale statuses.
 */
module.exports = {
  async up(queryInterface) {
    // Check approved write-offs and their values
    const [writeOffs] = await queryInterface.sequelize.query(`
      SELECT
        wo.id, wo.write_off_number, wo.status, wo.approved_at,
        wo.total_cost_amount, wo.currency,
        a.asset_tag, a.make, a.model, a.status as asset_status,
        a.price_amount as asset_price, a.cost_amount as asset_cost, a.is_serialized,
        au.price_amount as unit_price, au.cost_amount as unit_cost, au.status as unit_status
      FROM inventory_write_offs wo
      JOIN assets a ON wo.asset_id = a.id
      LEFT JOIN asset_units au ON wo.asset_unit_id = au.id
      WHERE wo.status = 'APPROVED'
      ORDER BY wo.approved_at
    `);

    console.log(`=== ${writeOffs.length} APPROVED write-offs ===`);
    for (const wo of writeOffs) {
      const price = wo.unit_price || wo.asset_price || 0;
      const cost = wo.unit_cost || wo.asset_cost || 0;
      console.log(`  ${wo.write_off_number}: ${wo.asset_tag} ${wo.make} ${wo.model} | asset_status=${wo.asset_status} | price=${price} cost=${cost} | unit_status=${wo.unit_status || 'N/A'} | approved_at=${wo.approved_at}`);
    }

    // Check current inventory value
    const [invVal] = await queryInterface.sequelize.query(`
      SELECT
        COALESCE(SUM(
          CASE WHEN a.is_serialized THEN
            (SELECT COALESCE(SUM(COALESCE(u.price_amount, a.price_amount)), 0)
             FROM asset_units u WHERE u.asset_id = a.id AND u.status NOT IN ('Sold','Scrapped','In Repair'))
          ELSE a.quantity * COALESCE(a.price_amount, 0) END
        ), 0) AS inventory_value,
        COUNT(*) as asset_count
      FROM assets a
      WHERE a.deleted_at IS NULL
        AND a.status IN ('In Stock','Processing','Reserved')
        AND (
          a.is_serialized = false AND a.quantity > 0
          OR a.is_serialized = true AND EXISTS (
            SELECT 1 FROM asset_units u WHERE u.asset_id = a.id AND u.status NOT IN ('Sold','Scrapped')
          )
        )
    `);
    console.log(`=== Current inventory: ${invVal[0].asset_count} assets, value=${invVal[0].inventory_value} ===`);

    // Fix any remaining stale statuses
    const [fixed] = await queryInterface.sequelize.query(`
      UPDATE assets SET status = 'Written Off'
      WHERE is_serialized = true
        AND status NOT IN ('Written Off', 'Sold')
        AND deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM asset_units au
          WHERE au.asset_id = assets.id AND au.status NOT IN ('Sold', 'Scrapped')
        )
        AND EXISTS (
          SELECT 1 FROM asset_units au WHERE au.asset_id = assets.id
        )
      RETURNING id, asset_tag, make, model
    `);
    if (fixed.length > 0) {
      console.log(`=== Fixed ${fixed.length} stale statuses: ${fixed.map(r => r.asset_tag).join(', ')} ===`);
    } else {
      console.log('=== No stale statuses to fix ===');
    }
  },

  async down() {}
};
