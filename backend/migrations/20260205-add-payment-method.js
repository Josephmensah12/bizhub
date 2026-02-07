'use strict';

/**
 * Migration: Add Payment Method to Invoice Payments
 *
 * Adds payment_method enum and payment_method_other_text fields
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // 1. Create payment method enum type
      await queryInterface.sequelize.query(`
        CREATE TYPE "enum_invoice_payments_payment_method" AS ENUM ('Cash', 'MoMo', 'Card', 'ACH', 'Other');
      `, { transaction });

      // 2. Add payment_method column
      await queryInterface.sequelize.query(`
        ALTER TABLE "invoice_payments"
        ADD COLUMN "payment_method" "enum_invoice_payments_payment_method" NOT NULL DEFAULT 'Cash';
      `, { transaction });

      // 3. Add payment_method_other_text column
      await queryInterface.addColumn('invoice_payments', 'payment_method_other_text', {
        type: Sequelize.STRING(255),
        allowNull: true
      }, { transaction });

      // 4. Remove the default after adding existing rows
      await queryInterface.sequelize.query(`
        ALTER TABLE "invoice_payments" ALTER COLUMN "payment_method" DROP DEFAULT;
      `, { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Remove columns
      await queryInterface.removeColumn('invoice_payments', 'payment_method_other_text', { transaction });
      await queryInterface.removeColumn('invoice_payments', 'payment_method', { transaction });

      // Drop enum type
      await queryInterface.sequelize.query(`
        DROP TYPE IF EXISTS "enum_invoice_payments_payment_method";
      `, { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
