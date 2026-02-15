'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Add STOCK_ADJUSTED to inventory_item_events event_type enum
    // ALTER TYPE ... ADD VALUE cannot run inside a transaction in PostgreSQL
    try {
      await queryInterface.sequelize.query(
        `ALTER TYPE "enum_inventory_item_events_event_type" ADD VALUE IF NOT EXISTS 'STOCK_ADJUSTED';`
      );
    } catch (err) {
      // Ignore if already exists or enum name differs
      console.log('Note: Could not add STOCK_ADJUSTED to enum (may already exist):', err.message);
    }

    const transaction = await queryInterface.sequelize.transaction();

    try {
      // 2. Create stock_takes table
      await queryInterface.createTable('stock_takes', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true
        },
        reference: {
          type: Sequelize.STRING(20),
          allowNull: false,
          unique: true
        },
        name: {
          type: Sequelize.STRING(100),
          allowNull: true
        },
        status: {
          type: Sequelize.ENUM('draft', 'in_progress', 'under_review', 'finalized', 'cancelled'),
          allowNull: false,
          defaultValue: 'draft'
        },
        scope: {
          type: Sequelize.ENUM('full', 'category', 'location'),
          allowNull: false,
          defaultValue: 'full'
        },
        scope_filter: {
          type: Sequelize.JSONB,
          allowNull: true
        },
        blind_count: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false
        },
        started_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        completed_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        finalized_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        finalized_by: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'id' }
        },
        created_by: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'id' }
        },
        notes: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        summary: {
          type: Sequelize.JSONB,
          allowNull: true
        },
        company_id: {
          type: Sequelize.INTEGER,
          allowNull: true
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('NOW()')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('NOW()')
        }
      }, { transaction });

      // 3. Create stock_take_items table
      await queryInterface.createTable('stock_take_items', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true
        },
        stock_take_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'stock_takes', key: 'id' },
          onDelete: 'CASCADE'
        },
        asset_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'assets', key: 'id' }
        },
        expected_quantity: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0
        },
        counted_quantity: {
          type: Sequelize.INTEGER,
          allowNull: true
        },
        variance: {
          type: Sequelize.INTEGER,
          allowNull: true
        },
        status: {
          type: Sequelize.ENUM('pending', 'counted', 'verified', 'adjusted'),
          allowNull: false,
          defaultValue: 'pending'
        },
        resolution: {
          type: Sequelize.ENUM('match', 'sold_not_invoiced', 'damaged', 'lost_stolen', 'found_extra', 'miscount', 'other'),
          allowNull: true
        },
        resolution_notes: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        counted_by: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'id' }
        },
        counted_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        serial_verified: {
          type: Sequelize.BOOLEAN,
          allowNull: true
        },
        company_id: {
          type: Sequelize.INTEGER,
          allowNull: true
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('NOW()')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('NOW()')
        }
      }, { transaction });

      // Indexes
      await queryInterface.addIndex('stock_take_items', ['stock_take_id'], { transaction });
      await queryInterface.addIndex('stock_take_items', ['asset_id'], { transaction });
      await queryInterface.addIndex('stock_take_items', ['stock_take_id', 'status'], { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.dropTable('stock_take_items', { transaction });
      await queryInterface.dropTable('stock_takes', { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    // Clean up enums
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_stock_takes_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_stock_takes_scope";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_stock_take_items_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_stock_take_items_resolution";');
  }
};
