'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('asset_units', 'barcode', {
      type: Sequelize.STRING(100),
      allowNull: true,
      comment: 'SalesBinder SKU/barcode — used as alternate lookup during stock take scanning'
    });

    await queryInterface.addIndex('asset_units', ['barcode'], {
      name: 'asset_units_barcode',
      where: { barcode: { [Sequelize.Op.ne]: null } }
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('asset_units', 'asset_units_barcode');
    await queryInterface.removeColumn('asset_units', 'barcode');
  }
};
