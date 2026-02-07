'use strict';

/**
 * Migration: Create Invoices and Invoice Items tables
 *
 * Sales module - Invoice management with inventory locking
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // Create invoices table
    await queryInterface.createTable('invoices', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      invoice_number: {
        type: Sequelize.STRING(30),
        allowNull: false,
        unique: true
      },
      customer_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'customers',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      invoice_date: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      status: {
        type: Sequelize.ENUM('Draft', 'Paid', 'Cancelled'),
        allowNull: false,
        defaultValue: 'Draft'
      },
      currency: {
        type: Sequelize.ENUM('USD', 'GHS', 'GBP'),
        allowNull: false,
        defaultValue: 'GHS'
      },
      subtotal_amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0
      },
      total_amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0
      },
      total_cost_amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0
      },
      total_profit_amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0
      },
      margin_percent: {
        type: Sequelize.DECIMAL(8, 4),
        allowNull: true
      },
      // FX snapshot fields
      fx_rate_source: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      fx_rate_fetched: {
        type: Sequelize.DECIMAL(12, 6),
        allowNull: true
      },
      fx_rate_markup: {
        type: Sequelize.DECIMAL(8, 4),
        allowNull: true
      },
      fx_rate_used: {
        type: Sequelize.DECIMAL(12, 6),
        allowNull: true
      },
      fx_fetched_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      // Notes
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      // Audit fields
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      updated_by: {
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
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });

    // Create invoice_items table
    await queryInterface.createTable('invoice_items', {
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
      asset_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'assets',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT' // Prevent deletion of assets linked to invoices
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      unit_price_amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0
      },
      line_total_amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0
      },
      // Cost tracking (in invoice currency after FX conversion)
      unit_cost_amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0
      },
      line_cost_amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0
      },
      line_profit_amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0
      },
      // Original cost info (before FX conversion)
      original_cost_currency: {
        type: Sequelize.STRING(3),
        allowNull: true
      },
      original_cost_amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });

    // Create indexes
    await queryInterface.addIndex('invoices', ['invoice_number']);
    await queryInterface.addIndex('invoices', ['customer_id']);
    await queryInterface.addIndex('invoices', ['invoice_date']);
    await queryInterface.addIndex('invoices', ['status']);
    await queryInterface.addIndex('invoices', ['created_at']);

    await queryInterface.addIndex('invoice_items', ['invoice_id']);
    await queryInterface.addIndex('invoice_items', ['asset_id']);

    // Add invoice_number sequence for auto-generation
    await queryInterface.sequelize.query(`
      CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START WITH 1 INCREMENT BY 1;
    `);

    // Add status field to assets if not exists (for Reserved/Sold tracking)
    const tableInfo = await queryInterface.describeTable('assets');
    if (!tableInfo.status) {
      await queryInterface.addColumn('assets', 'status', {
        type: Sequelize.ENUM('In Stock', 'Reserved', 'Sold', 'Damaged', 'Returned'),
        allowNull: false,
        defaultValue: 'In Stock'
      });
    }

    // Add invoice_item_id to assets for tracking which invoice item reserved/sold it
    if (!tableInfo.invoice_item_id) {
      await queryInterface.addColumn('assets', 'invoice_item_id', {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'invoice_items',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }
  },

  async down(queryInterface, Sequelize) {
    // Remove columns from assets
    const tableInfo = await queryInterface.describeTable('assets');
    if (tableInfo.invoice_item_id) {
      await queryInterface.removeColumn('assets', 'invoice_item_id');
    }
    if (tableInfo.status) {
      await queryInterface.removeColumn('assets', 'status');
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_assets_status";');
    }

    // Drop sequence
    await queryInterface.sequelize.query('DROP SEQUENCE IF EXISTS invoice_number_seq;');

    // Drop tables
    await queryInterface.dropTable('invoice_items');
    await queryInterface.dropTable('invoices');

    // Drop enum types
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_invoices_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_invoices_currency";');
  }
};
