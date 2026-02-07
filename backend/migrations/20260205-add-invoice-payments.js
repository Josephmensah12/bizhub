'use strict';

/**
 * Migration: Add Invoice Payments
 *
 * - Updates invoice status enum to include UNPAID, PARTIALLY_PAID, PAID, CANCELLED
 * - Adds amount_paid and balance_due fields to invoices
 * - Creates invoice_payments table for payment records
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // 1. Add new columns to invoices table
      await queryInterface.addColumn('invoices', 'amount_paid', {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      }, { transaction });

      await queryInterface.addColumn('invoices', 'balance_due', {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      }, { transaction });

      // 2. Create new enum type for status
      await queryInterface.sequelize.query(`
        CREATE TYPE "enum_invoices_status_new" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');
      `, { transaction });

      // 3. Add temporary column with new enum
      await queryInterface.sequelize.query(`
        ALTER TABLE "invoices" ADD COLUMN "status_new" "enum_invoices_status_new";
      `, { transaction });

      // 4. Migrate existing status values
      await queryInterface.sequelize.query(`
        UPDATE invoices SET status_new = CASE
          WHEN status = 'Draft' THEN 'UNPAID'::"enum_invoices_status_new"
          WHEN status = 'Paid' THEN 'PAID'::"enum_invoices_status_new"
          WHEN status = 'Cancelled' THEN 'CANCELLED'::"enum_invoices_status_new"
          ELSE 'UNPAID'::"enum_invoices_status_new"
        END;
      `, { transaction });

      // 5. Drop old status column
      await queryInterface.sequelize.query(`
        ALTER TABLE "invoices" DROP COLUMN "status";
      `, { transaction });

      // 6. Rename new column to status
      await queryInterface.sequelize.query(`
        ALTER TABLE "invoices" RENAME COLUMN "status_new" TO "status";
      `, { transaction });

      // 7. Set status as not null with default
      await queryInterface.sequelize.query(`
        ALTER TABLE "invoices" ALTER COLUMN "status" SET NOT NULL;
        ALTER TABLE "invoices" ALTER COLUMN "status" SET DEFAULT 'UNPAID'::"enum_invoices_status_new";
      `, { transaction });

      // 8. Drop old enum type
      await queryInterface.sequelize.query(`
        DROP TYPE IF EXISTS "enum_invoices_status";
      `, { transaction });

      // 9. Rename new enum type to standard name
      await queryInterface.sequelize.query(`
        ALTER TYPE "enum_invoices_status_new" RENAME TO "enum_invoices_status";
      `, { transaction });

      // 10. Update balance_due for existing invoices
      await queryInterface.sequelize.query(`
        UPDATE invoices SET balance_due = total_amount - amount_paid;
      `, { transaction });

      // 11. Create invoice_payments table
      await queryInterface.createTable('invoice_payments', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true
        },
        invoice_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'invoices',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        payment_date: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW
        },
        amount: {
          type: Sequelize.DECIMAL(15, 2),
          allowNull: false
        },
        currency: {
          type: Sequelize.STRING(3),
          allowNull: false,
          defaultValue: 'GHS'
        },
        comment: {
          type: Sequelize.TEXT,
          allowNull: false
        },
        received_by_user_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: 'users',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW
        }
      }, { transaction });

      // 12. Add index for faster lookups
      await queryInterface.addIndex('invoice_payments', ['invoice_id'], {
        name: 'idx_invoice_payments_invoice_id',
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
      // Drop payments table
      await queryInterface.dropTable('invoice_payments', { transaction });

      // Remove new columns from invoices
      await queryInterface.removeColumn('invoices', 'amount_paid', { transaction });
      await queryInterface.removeColumn('invoices', 'balance_due', { transaction });

      // Recreate old status enum
      await queryInterface.sequelize.query(`
        CREATE TYPE "enum_invoices_status_old" AS ENUM ('Draft', 'Paid', 'Cancelled');
      `, { transaction });

      // Add temp column with old enum
      await queryInterface.sequelize.query(`
        ALTER TABLE "invoices" ADD COLUMN "status_old" "enum_invoices_status_old";
      `, { transaction });

      // Migrate back
      await queryInterface.sequelize.query(`
        UPDATE invoices SET status_old = CASE
          WHEN status = 'UNPAID' THEN 'Draft'::"enum_invoices_status_old"
          WHEN status = 'PARTIALLY_PAID' THEN 'Draft'::"enum_invoices_status_old"
          WHEN status = 'PAID' THEN 'Paid'::"enum_invoices_status_old"
          WHEN status = 'CANCELLED' THEN 'Cancelled'::"enum_invoices_status_old"
          ELSE 'Draft'::"enum_invoices_status_old"
        END;
      `, { transaction });

      // Drop new column
      await queryInterface.sequelize.query(`
        ALTER TABLE "invoices" DROP COLUMN "status";
      `, { transaction });

      // Rename old column
      await queryInterface.sequelize.query(`
        ALTER TABLE "invoices" RENAME COLUMN "status_old" TO "status";
      `, { transaction });

      // Drop new enum
      await queryInterface.sequelize.query(`
        DROP TYPE IF EXISTS "enum_invoices_status";
      `, { transaction });

      // Rename old enum
      await queryInterface.sequelize.query(`
        ALTER TYPE "enum_invoices_status_old" RENAME TO "enum_invoices_status";
      `, { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
