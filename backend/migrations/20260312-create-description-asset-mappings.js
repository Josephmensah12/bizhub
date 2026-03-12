'use strict';

/**
 * Migration: Description Asset Mappings
 *
 * Creates description_asset_mappings table to map SalesBinder invoice item
 * descriptions to local asset records.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('description_asset_mappings', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'SalesBinder invoice item description'
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
      match_type: {
        type: Sequelize.ENUM('exact', 'fuzzy', 'manual'),
        allowNull: false,
        defaultValue: 'manual'
      },
      confidence: {
        type: Sequelize.FLOAT,
        allowNull: true,
        comment: '0-1, for fuzzy matches'
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Optional admin notes'
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

    // Unique index on description to prevent duplicate mappings
    await queryInterface.addIndex('description_asset_mappings', ['description'], {
      unique: true,
      name: 'idx_description_asset_mappings_description_unique'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('description_asset_mappings');
  }
};
