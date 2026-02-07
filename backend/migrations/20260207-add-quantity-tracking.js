'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('assets', 'quantity_reserved', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });
    await queryInterface.addColumn('assets', 'quantity_sold', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });
    await queryInterface.addColumn('assets', 'quantity_returned', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('assets', 'quantity_returned');
    await queryInterface.removeColumn('assets', 'quantity_sold');
    await queryInterface.removeColumn('assets', 'quantity_reserved');
  }
};
