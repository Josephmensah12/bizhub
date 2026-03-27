'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('invoices', 'fulfillment_type', {
      type: Sequelize.STRING(10),
      allowNull: false,
      defaultValue: 'delivered',
      comment: 'delivered = items left store on invoice; held = items stay until fully paid (layaway)'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('invoices', 'fulfillment_type');
  }
};
