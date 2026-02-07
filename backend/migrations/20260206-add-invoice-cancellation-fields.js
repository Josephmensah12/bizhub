'use strict';

/**
 * Migration: Add invoice cancellation and soft-delete fields
 *
 * Adds fields to support:
 * - Invoice cancellation with reason and audit trail
 * - Soft-delete functionality for invoices
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Add cancellation fields
      await queryInterface.addColumn('invoices', 'cancelled_at', {
        type: Sequelize.DATE,
        allowNull: true
      }, { transaction });

      await queryInterface.addColumn('invoices', 'cancelled_by_user_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      }, { transaction });

      await queryInterface.addColumn('invoices', 'cancellation_reason', {
        type: Sequelize.TEXT,
        allowNull: true
      }, { transaction });

      // Add soft-delete fields
      await queryInterface.addColumn('invoices', 'is_deleted', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      }, { transaction });

      await queryInterface.addColumn('invoices', 'deleted_at', {
        type: Sequelize.DATE,
        allowNull: true
      }, { transaction });

      await queryInterface.addColumn('invoices', 'deleted_by_user_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      }, { transaction });

      // Add new event types to inventory_item_events enum
      // First check if they exist
      const [eventTypes] = await queryInterface.sequelize.query(
        `SELECT enumlabel FROM pg_enum
         WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'enum_inventory_item_events_event_type')`,
        { transaction }
      );

      const existingTypes = eventTypes.map(e => e.enumlabel);

      if (!existingTypes.includes('INVOICE_CANCELLED')) {
        await queryInterface.sequelize.query(
          `ALTER TYPE "enum_inventory_item_events_event_type" ADD VALUE 'INVOICE_CANCELLED'`,
          { transaction }
        );
      }

      if (!existingTypes.includes('INVOICE_CANCELLED_INVENTORY_RELEASED')) {
        await queryInterface.sequelize.query(
          `ALTER TYPE "enum_inventory_item_events_event_type" ADD VALUE 'INVOICE_CANCELLED_INVENTORY_RELEASED'`,
          { transaction }
        );
      }

      await transaction.commit();
      console.log('Migration completed: Added invoice cancellation and soft-delete fields');
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.removeColumn('invoices', 'cancelled_at', { transaction });
      await queryInterface.removeColumn('invoices', 'cancelled_by_user_id', { transaction });
      await queryInterface.removeColumn('invoices', 'cancellation_reason', { transaction });
      await queryInterface.removeColumn('invoices', 'is_deleted', { transaction });
      await queryInterface.removeColumn('invoices', 'deleted_at', { transaction });
      await queryInterface.removeColumn('invoices', 'deleted_by_user_id', { transaction });

      // Note: PostgreSQL doesn't support removing enum values easily
      // The event types will remain but won't be used

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
