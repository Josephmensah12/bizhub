'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('invoice_items', 'voided_at', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null
    });

    await queryInterface.addColumn('invoice_items', 'voided_by_user_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.addColumn('invoice_items', 'void_reason', {
      type: Sequelize.TEXT,
      allowNull: true
    });

    // Partial index: quickly find active (non-voided) items per invoice
    await queryInterface.addIndex('invoice_items', ['invoice_id', 'voided_at'], {
      name: 'idx_invoice_items_active',
      where: { voided_at: null }
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('invoice_items', 'idx_invoice_items_active');
    await queryInterface.removeColumn('invoice_items', 'void_reason');
    await queryInterface.removeColumn('invoice_items', 'voided_by_user_id');
    await queryInterface.removeColumn('invoice_items', 'voided_at');
  }
};
