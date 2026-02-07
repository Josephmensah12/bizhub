'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('assets', 'cost_currency', {
      type: Sequelize.STRING(3),
      allowNull: false,
      defaultValue: 'USD',
      comment: 'ISO 4217 currency code for cost'
    });

    await queryInterface.addColumn('assets', 'price_currency', {
      type: Sequelize.STRING(3),
      allowNull: false,
      defaultValue: 'GHS',
      comment: 'ISO 4217 currency code for selling price'
    });

    // Rename existing columns for clarity
    await queryInterface.renameColumn('assets', 'cost', 'cost_amount');
    await queryInterface.renameColumn('assets', 'price', 'price_amount');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('assets', 'cost_currency');
    await queryInterface.removeColumn('assets', 'price_currency');
    await queryInterface.renameColumn('assets', 'cost_amount', 'cost');
    await queryInterface.renameColumn('assets', 'price_amount', 'price');
  }
};
