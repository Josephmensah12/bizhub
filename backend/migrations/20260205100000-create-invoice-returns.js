'use strict';

/**
 * Migration: Create Invoice Returns Tables
 *
 * Creates tables for return management:
 * - invoice_returns: Header record for return events
 * - invoice_return_items: Line items being returned
 * - customer_credits: Store credit balances for exchanges
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // 1. Create return type enum
      await queryInterface.sequelize.query(`
        CREATE TYPE "enum_invoice_returns_return_type" AS ENUM ('RETURN_REFUND', 'EXCHANGE');
      `, { transaction });

      // 2. Create return status enum
      await queryInterface.sequelize.query(`
        CREATE TYPE "enum_invoice_returns_status" AS ENUM ('DRAFT', 'FINALIZED', 'CANCELLED');
      `, { transaction });

      // 3. Create restock condition enum
      await queryInterface.sequelize.query(`
        CREATE TYPE "enum_invoice_return_items_restock_condition" AS ENUM ('AS_IS', 'NEEDS_TESTING', 'NEEDS_REPAIR');
      `, { transaction });

      // 4. Create credit status enum
      await queryInterface.sequelize.query(`
        CREATE TYPE "enum_customer_credits_status" AS ENUM ('ACTIVE', 'CONSUMED', 'VOIDED');
      `, { transaction });

      // 5. Create invoice_returns table
      await queryInterface.createTable('invoice_returns', {
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
          onDelete: 'RESTRICT'
        },
        customer_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'customers',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },
        return_type: {
          type: Sequelize.ENUM('RETURN_REFUND', 'EXCHANGE'),
          allowNull: false
        },
        status: {
          type: Sequelize.ENUM('DRAFT', 'FINALIZED', 'CANCELLED'),
          allowNull: false,
          defaultValue: 'DRAFT'
        },
        currency: {
          type: Sequelize.STRING(3),
          allowNull: false,
          defaultValue: 'GHS'
        },
        total_return_amount: {
          type: Sequelize.DECIMAL(15, 2),
          allowNull: false,
          defaultValue: 0
        },
        reason: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW
        },
        created_by_user_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: 'users',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        finalized_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        finalized_by_user_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: 'users',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        cancelled_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        cancelled_by_user_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: 'users',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        }
      }, { transaction });

      // 6. Create invoice_return_items table
      await queryInterface.createTable('invoice_return_items', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true
        },
        return_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'invoice_returns',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        invoice_item_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'invoice_items',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },
        asset_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: 'assets',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        quantity_returned: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 1
        },
        unit_price_at_sale: {
          type: Sequelize.DECIMAL(15, 2),
          allowNull: false
        },
        line_return_amount: {
          type: Sequelize.DECIMAL(15, 2),
          allowNull: false
        },
        restock_condition: {
          type: Sequelize.ENUM('AS_IS', 'NEEDS_TESTING', 'NEEDS_REPAIR'),
          allowNull: true,
          defaultValue: 'AS_IS'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW
        }
      }, { transaction });

      // 7. Create customer_credits table
      await queryInterface.createTable('customer_credits', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true
        },
        customer_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'customers',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },
        currency: {
          type: Sequelize.STRING(3),
          allowNull: false,
          defaultValue: 'GHS'
        },
        original_amount: {
          type: Sequelize.DECIMAL(15, 2),
          allowNull: false
        },
        remaining_amount: {
          type: Sequelize.DECIMAL(15, 2),
          allowNull: false
        },
        status: {
          type: Sequelize.ENUM('ACTIVE', 'CONSUMED', 'VOIDED'),
          allowNull: false,
          defaultValue: 'ACTIVE'
        },
        source_return_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'invoice_returns',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW
        },
        created_by_user_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: 'users',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        voided_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        voided_by_user_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: 'users',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        }
      }, { transaction });

      // 8. Add quantity_returned_total to invoice_items
      await queryInterface.addColumn('invoice_items', 'quantity_returned_total', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      }, { transaction });

      // 9. Add linked_return_id to invoice_payments (transactions)
      await queryInterface.addColumn('invoice_payments', 'linked_return_id', {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'invoice_returns',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      }, { transaction });

      // 10. Add indexes
      await queryInterface.addIndex('invoice_returns', ['invoice_id'], {
        name: 'idx_invoice_returns_invoice',
        transaction
      });

      await queryInterface.addIndex('invoice_returns', ['customer_id'], {
        name: 'idx_invoice_returns_customer',
        transaction
      });

      await queryInterface.addIndex('invoice_returns', ['status'], {
        name: 'idx_invoice_returns_status',
        transaction
      });

      await queryInterface.addIndex('invoice_return_items', ['return_id'], {
        name: 'idx_invoice_return_items_return',
        transaction
      });

      await queryInterface.addIndex('invoice_return_items', ['invoice_item_id'], {
        name: 'idx_invoice_return_items_invoice_item',
        transaction
      });

      await queryInterface.addIndex('customer_credits', ['customer_id', 'status'], {
        name: 'idx_customer_credits_customer_status',
        transaction
      });

      await queryInterface.addIndex('customer_credits', ['source_return_id'], {
        name: 'idx_customer_credits_source_return',
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
      // Remove columns from existing tables
      await queryInterface.removeColumn('invoice_payments', 'linked_return_id', { transaction });
      await queryInterface.removeColumn('invoice_items', 'quantity_returned_total', { transaction });

      // Drop tables in reverse order
      await queryInterface.dropTable('customer_credits', { transaction });
      await queryInterface.dropTable('invoice_return_items', { transaction });
      await queryInterface.dropTable('invoice_returns', { transaction });

      // Drop enum types
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_customer_credits_status";', { transaction });
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_invoice_return_items_restock_condition";', { transaction });
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_invoice_returns_status";', { transaction });
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_invoice_returns_return_type";', { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
