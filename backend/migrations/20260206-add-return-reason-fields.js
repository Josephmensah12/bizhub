'use strict';

/**
 * Migration: Add return reason fields to invoice_returns table
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Create return reason code enum
      await queryInterface.sequelize.query(`
        CREATE TYPE "enum_invoice_returns_return_reason_code" AS ENUM (
          'BUYER_REMORSE',
          'DEFECT',
          'EXCHANGE',
          'OTHER'
        );
      `, { transaction });

      // Add return_reason_code column
      await queryInterface.addColumn('invoice_returns', 'return_reason_code', {
        type: Sequelize.ENUM('BUYER_REMORSE', 'DEFECT', 'EXCHANGE', 'OTHER'),
        allowNull: true // Allow null for existing records
      }, { transaction });

      // Add return_reason_details column
      await queryInterface.addColumn('invoice_returns', 'return_reason_details', {
        type: Sequelize.TEXT,
        allowNull: true
      }, { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.removeColumn('invoice_returns', 'return_reason_details', { transaction });
      await queryInterface.removeColumn('invoice_returns', 'return_reason_code', { transaction });

      await queryInterface.sequelize.query(
        'DROP TYPE IF EXISTS "enum_invoice_returns_return_reason_code";',
        { transaction }
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
