'use strict';

/**
 * Migration: Custom Taxonomy Values
 *
 * - Creates custom_taxonomy_values table for user-defined categories/asset types
 * - Drops CHECK constraints on assets table (category, asset_type, taxonomy match)
 * - Widens assets.category and assets.asset_type from STRING(30) to STRING(60)
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Step 1: Create custom_taxonomy_values table
    await queryInterface.createTable('custom_taxonomy_values', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      value_type: {
        type: Sequelize.STRING(20),
        allowNull: false,
        comment: 'category or asset_type'
      },
      value: {
        type: Sequelize.STRING(60),
        allowNull: false,
        comment: 'Display value'
      },
      parent_category: {
        type: Sequelize.STRING(60),
        allowNull: true,
        comment: 'NULL for categories; required for asset_types'
      },
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
    });

    // Add case-insensitive unique index
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX idx_custom_taxonomy_unique
      ON custom_taxonomy_values (value_type, LOWER(value))
    `);

    // Step 2: Drop CHECK constraints on assets table
    await queryInterface.sequelize.query(`
      ALTER TABLE assets DROP CONSTRAINT IF EXISTS check_valid_category
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE assets DROP CONSTRAINT IF EXISTS check_valid_asset_type
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE assets DROP CONSTRAINT IF EXISTS check_taxonomy_match
    `);

    // Step 3: Widen assets.category and assets.asset_type from STRING(30) to STRING(60)
    await queryInterface.changeColumn('assets', 'category', {
      type: Sequelize.STRING(60),
      allowNull: false
    });
    await queryInterface.changeColumn('assets', 'asset_type', {
      type: Sequelize.STRING(60),
      allowNull: false
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Revert column widths
    await queryInterface.changeColumn('assets', 'category', {
      type: Sequelize.STRING(30),
      allowNull: false
    });
    await queryInterface.changeColumn('assets', 'asset_type', {
      type: Sequelize.STRING(30),
      allowNull: false
    });

    // Re-add CHECK constraints
    const TAXONOMY = {
      'Computer': ['Laptop', 'Desktop'],
      'Smartphone': ['iPhone', 'Samsung Galaxy', 'Google Pixel'],
      'Consumer Electronics': ['Bluetooth Speaker', 'Home Theatre System', 'Television'],
      'Appliance': ['Refrigerator', 'Microwave', 'Washing Machine', 'Air Conditioner']
    };
    const ALL_ASSET_TYPES = Object.values(TAXONOMY).flat();

    await queryInterface.sequelize.query(`
      ALTER TABLE assets ADD CONSTRAINT check_valid_category
      CHECK (category IN ('Computer', 'Smartphone', 'Consumer Electronics', 'Appliance'))
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE assets ADD CONSTRAINT check_valid_asset_type
      CHECK (asset_type IN (${ALL_ASSET_TYPES.map(t => `'${t}'`).join(', ')}))
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE assets ADD CONSTRAINT check_taxonomy_match
      CHECK (
        (category = 'Computer' AND asset_type IN ('Laptop', 'Desktop'))
        OR (category = 'Smartphone' AND asset_type IN ('iPhone', 'Samsung Galaxy', 'Google Pixel'))
        OR (category = 'Consumer Electronics' AND asset_type IN ('Bluetooth Speaker', 'Home Theatre System', 'Television'))
        OR (category = 'Appliance' AND asset_type IN ('Refrigerator', 'Microwave', 'Washing Machine', 'Air Conditioner'))
      )
    `);

    // Drop the unique index and table
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS idx_custom_taxonomy_unique
    `);
    await queryInterface.dropTable('custom_taxonomy_values');
  }
};
