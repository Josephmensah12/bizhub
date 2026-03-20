'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add category/asset_type columns to invoice_items for unlinked items
    const desc = await queryInterface.describeTable('invoice_items');
    if (!desc.category) {
      await queryInterface.addColumn('invoice_items', 'category', {
        type: Sequelize.STRING(60),
        allowNull: true,
        comment: 'Override category when asset_id is NULL (imported items)'
      });
    }
    if (!desc.asset_type) {
      await queryInterface.addColumn('invoice_items', 'asset_type', {
        type: Sequelize.STRING(60),
        allowNull: true,
        comment: 'Override asset_type when asset_id is NULL (imported items)'
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('invoice_items', 'category').catch(() => {});
    await queryInterface.removeColumn('invoice_items', 'asset_type').catch(() => {});
  }
};
