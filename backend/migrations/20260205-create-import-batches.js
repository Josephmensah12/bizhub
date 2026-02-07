'use strict';

/**
 * Migration: Create inventory_import_batches table and add import_batch_id to assets
 *
 * Stores every bulk import as a persistent record with metadata for:
 * - Audit trail
 * - Admin rollback capability
 * - Error tracking
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create inventory_import_batches table
    await queryInterface.createTable('inventory_import_batches', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
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
      source_type: {
        type: Sequelize.STRING(10),
        allowNull: false,
        comment: 'csv, xls, xlsx'
      },
      original_file_name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      file_size_bytes: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      sheet_name: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      mapping_preset_id: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      mapping_config_json: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Column mappings, constants, transforms used'
      },
      fx_rate_metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'FX rates used during import'
      },
      import_mode: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'skip-errors',
        comment: 'skip-errors or all-or-nothing'
      },
      rows_total: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      rows_imported: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      rows_failed: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      rows_skipped_duplicates: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      status: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: 'pending',
        comment: 'pending, processing, completed, completed_with_errors, failed, reverted'
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      error_report_json: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Detailed error rows for download'
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      // Revert tracking
      reverted_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      reverted_by_user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      revert_reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Add indexes
    await queryInterface.addIndex('inventory_import_batches', ['created_by_user_id'], {
      name: 'idx_import_batches_created_by'
    });
    await queryInterface.addIndex('inventory_import_batches', ['status'], {
      name: 'idx_import_batches_status'
    });
    await queryInterface.addIndex('inventory_import_batches', ['created_at'], {
      name: 'idx_import_batches_created_at'
    });

    // Add import_batch_id to assets table
    await queryInterface.addColumn('assets', 'import_batch_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'inventory_import_batches',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    // Add index for batch lookups
    await queryInterface.addIndex('assets', ['import_batch_id'], {
      name: 'idx_assets_import_batch_id'
    });

    // Add deleted_at for soft delete support
    const tableInfo = await queryInterface.describeTable('assets');
    if (!tableInfo.deleted_at) {
      await queryInterface.addColumn('assets', 'deleted_at', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    // Remove index and column from assets
    await queryInterface.removeIndex('assets', 'idx_assets_import_batch_id');
    await queryInterface.removeColumn('assets', 'import_batch_id');

    // Remove deleted_at if we added it
    const tableInfo = await queryInterface.describeTable('assets');
    if (tableInfo.deleted_at) {
      await queryInterface.removeColumn('assets', 'deleted_at');
    }

    // Drop indexes
    await queryInterface.removeIndex('inventory_import_batches', 'idx_import_batches_created_at');
    await queryInterface.removeIndex('inventory_import_batches', 'idx_import_batches_status');
    await queryInterface.removeIndex('inventory_import_batches', 'idx_import_batches_created_by');

    // Drop the table
    await queryInterface.dropTable('inventory_import_batches');
  }
};
