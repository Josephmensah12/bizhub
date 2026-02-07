'use strict';

/**
 * Migration: Add Transaction Type and Void Fields to Invoice Payments
 *
 * Transforms invoice_payments into a full transaction system supporting:
 * - PAYMENT and REFUND transaction types
 * - Void functionality for audit trail
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // 1. Create transaction type enum
      await queryInterface.sequelize.query(`
        CREATE TYPE "enum_invoice_payments_transaction_type" AS ENUM ('PAYMENT', 'REFUND');
      `, { transaction });

      // 2. Add transaction_type column with default PAYMENT for existing records
      await queryInterface.sequelize.query(`
        ALTER TABLE "invoice_payments"
        ADD COLUMN "transaction_type" "enum_invoice_payments_transaction_type" NOT NULL DEFAULT 'PAYMENT';
      `, { transaction });

      // 3. Remove default after migration
      await queryInterface.sequelize.query(`
        ALTER TABLE "invoice_payments" ALTER COLUMN "transaction_type" DROP DEFAULT;
      `, { transaction });

      // 4. Add void fields
      await queryInterface.addColumn('invoice_payments', 'voided_at', {
        type: Sequelize.DATE,
        allowNull: true
      }, { transaction });

      await queryInterface.addColumn('invoice_payments', 'voided_by_user_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      }, { transaction });

      await queryInterface.addColumn('invoice_payments', 'void_reason', {
        type: Sequelize.TEXT,
        allowNull: true
      }, { transaction });

      // 5. Add index for faster queries on non-voided transactions
      await queryInterface.addIndex('invoice_payments', ['invoice_id', 'voided_at'], {
        name: 'idx_invoice_payments_invoice_active',
        where: { voided_at: null },
        transaction
      });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Remove index
      await queryInterface.removeIndex('invoice_payments', 'idx_invoice_payments_invoice_active', { transaction });

      // Remove void fields
      await queryInterface.removeColumn('invoice_payments', 'void_reason', { transaction });
      await queryInterface.removeColumn('invoice_payments', 'voided_by_user_id', { transaction });
      await queryInterface.removeColumn('invoice_payments', 'voided_at', { transaction });

      // Remove transaction_type column
      await queryInterface.removeColumn('invoice_payments', 'transaction_type', { transaction });

      // Drop enum type
      await queryInterface.sequelize.query(`
        DROP TYPE IF EXISTS "enum_invoice_payments_transaction_type";
      `, { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
