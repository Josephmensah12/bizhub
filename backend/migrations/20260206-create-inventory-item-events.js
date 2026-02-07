'use strict';

/**
 * Migration: Create Inventory Item Events Table
 *
 * Append-only audit log for inventory item lifecycle events
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Create event type enum
      await queryInterface.sequelize.query(`
        CREATE TYPE "enum_inventory_item_events_event_type" AS ENUM (
          'IMPORTED',
          'CREATED',
          'UPDATED',
          'ADDED_TO_INVOICE',
          'RESERVED',
          'SOLD',
          'PAYMENT_RECEIVED',
          'RETURN_INITIATED',
          'RETURN_FINALIZED',
          'REFUND_ISSUED',
          'EXCHANGE_CREDIT_CREATED',
          'CREDIT_APPLIED',
          'INVENTORY_RELEASED',
          'SOFT_DELETED',
          'RESTORED',
          'BULK_UPLOAD_REVERTED'
        );
      `, { transaction });

      // Create source enum
      await queryInterface.sequelize.query(`
        CREATE TYPE "enum_inventory_item_events_source" AS ENUM (
          'SYSTEM',
          'USER',
          'IMPORT',
          'INVOICE',
          'RETURN',
          'PAYMENT'
        );
      `, { transaction });

      // Create inventory_item_events table
      await queryInterface.createTable('inventory_item_events', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true
        },
        inventory_item_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'assets',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        event_type: {
          type: Sequelize.ENUM(
            'IMPORTED',
            'CREATED',
            'UPDATED',
            'ADDED_TO_INVOICE',
            'RESERVED',
            'SOLD',
            'PAYMENT_RECEIVED',
            'RETURN_INITIATED',
            'RETURN_FINALIZED',
            'REFUND_ISSUED',
            'EXCHANGE_CREDIT_CREATED',
            'CREDIT_APPLIED',
            'INVENTORY_RELEASED',
            'SOFT_DELETED',
            'RESTORED',
            'BULK_UPLOAD_REVERTED'
          ),
          allowNull: false
        },
        occurred_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW
        },
        actor_user_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: 'users',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        source: {
          type: Sequelize.ENUM('SYSTEM', 'USER', 'IMPORT', 'INVOICE', 'RETURN', 'PAYMENT'),
          allowNull: false,
          defaultValue: 'SYSTEM'
        },
        reference_type: {
          type: Sequelize.STRING(50),
          allowNull: true
        },
        reference_id: {
          type: Sequelize.STRING(50),
          allowNull: true
        },
        summary: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        details_json: {
          type: Sequelize.JSONB,
          allowNull: true
        }
      }, { transaction });

      // Add indexes for efficient querying
      await queryInterface.addIndex('inventory_item_events', ['inventory_item_id', 'occurred_at'], {
        name: 'idx_inventory_events_item_time',
        transaction
      });

      await queryInterface.addIndex('inventory_item_events', ['reference_type', 'reference_id'], {
        name: 'idx_inventory_events_reference',
        transaction
      });

      await queryInterface.addIndex('inventory_item_events', ['event_type'], {
        name: 'idx_inventory_events_type',
        transaction
      });

      await queryInterface.addIndex('inventory_item_events', ['occurred_at'], {
        name: 'idx_inventory_events_time',
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
      await queryInterface.dropTable('inventory_item_events', { transaction });

      await queryInterface.sequelize.query(
        'DROP TYPE IF EXISTS "enum_inventory_item_events_source";',
        { transaction }
      );

      await queryInterface.sequelize.query(
        'DROP TYPE IF EXISTS "enum_inventory_item_events_event_type";',
        { transaction }
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
