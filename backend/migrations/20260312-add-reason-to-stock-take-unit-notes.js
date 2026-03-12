'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('stock_take_unit_notes', 'reason', {
      type: Sequelize.STRING(50),
      allowNull: true,
      defaultValue: null
    });

    // Make notes nullable (reason alone may suffice)
    await queryInterface.changeColumn('stock_take_unit_notes', 'notes', {
      type: Sequelize.TEXT,
      allowNull: true
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('stock_take_unit_notes', 'reason');
    await queryInterface.changeColumn('stock_take_unit_notes', 'notes', {
      type: require('sequelize').TEXT,
      allowNull: false
    });
  }
};
