'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Create the ENUM type
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        CREATE TYPE "public"."enum_stock_take_items_count_method" AS ENUM('serial', 'quantity');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // 2. Add count_method column with default 'quantity'
    await queryInterface.addColumn('stock_take_items', 'count_method', {
      type: Sequelize.ENUM('serial', 'quantity'),
      allowNull: false,
      defaultValue: 'quantity'
    });

    // 3. Backfill: set count_method = 'serial' for items whose asset is serialized
    await queryInterface.sequelize.query(`
      UPDATE stock_take_items sti
      SET count_method = 'serial'
      FROM assets a
      WHERE sti.asset_id = a.id
        AND a.is_serialized = true
    `);

    // 4. Also set 'serial' for any items that have scans (even if asset flag is wrong)
    await queryInterface.sequelize.query(`
      UPDATE stock_take_items sti
      SET count_method = 'serial'
      WHERE EXISTS (
        SELECT 1 FROM stock_take_scans sts
        WHERE sts.stock_take_item_id = sti.id
      )
    `);

    // 5. Add index for filtering by count_method
    await queryInterface.addIndex('stock_take_items', ['stock_take_id', 'count_method'], {
      name: 'stock_take_items_session_method'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('stock_take_items', 'stock_take_items_session_method');
    await queryInterface.removeColumn('stock_take_items', 'count_method');
    await queryInterface.sequelize.query(`
      DROP TYPE IF EXISTS "public"."enum_stock_take_items_count_method";
    `);
  }
};
