'use strict';

module.exports = {
  async up(queryInterface) {
    // Add currency columns to asset_units
    await queryInterface.addColumn('asset_units', 'cost_currency', {
      type: 'VARCHAR(3)',
      allowNull: true,
      defaultValue: null
    });
    await queryInterface.addColumn('asset_units', 'price_currency', {
      type: 'VARCHAR(3)',
      allowNull: true,
      defaultValue: null
    });

    // Backfill existing units with their parent asset's currency
    await queryInterface.sequelize.query(`
      UPDATE asset_units au
      SET cost_currency = a.cost_currency
      FROM assets a
      WHERE au.asset_id = a.id AND au.cost_amount IS NOT NULL
    `);
    await queryInterface.sequelize.query(`
      UPDATE asset_units au
      SET price_currency = a.price_currency
      FROM assets a
      WHERE au.asset_id = a.id AND au.price_amount IS NOT NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('asset_units', 'cost_currency');
    await queryInterface.removeColumn('asset_units', 'price_currency');
  }
};
