'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('invoices', 'discount_percent', {
      type: Sequelize.DECIMAL(5, 2),
      allowNull: true,
      defaultValue: null
    });
    await queryInterface.addColumn('invoices', 'discount_amount', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: true,
      defaultValue: null
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('invoices', 'discount_percent');
    await queryInterface.removeColumn('invoices', 'discount_amount');
  }
};
