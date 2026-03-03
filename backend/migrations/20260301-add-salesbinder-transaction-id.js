'use strict';

/**
 * Migration: Add salesbinder_transaction_id to invoice_payments
 *
 * Allows tracking which SalesBinder transactions have been imported
 * for deduplication during payment migration.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('invoice_payments', 'salesbinder_transaction_id', {
      type: Sequelize.STRING(50),
      allowNull: true,
      unique: true
    });

    await queryInterface.addIndex('invoice_payments', ['salesbinder_transaction_id'], {
      name: 'idx_invoice_payments_sb_transaction_id',
      where: { salesbinder_transaction_id: { [Sequelize.Op.ne]: null } }
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('invoice_payments', 'idx_invoice_payments_sb_transaction_id');
    await queryInterface.removeColumn('invoice_payments', 'salesbinder_transaction_id');
  }
};
