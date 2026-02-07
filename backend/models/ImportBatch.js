/**
 * ImportBatch Model
 *
 * Tracks every bulk import operation for audit trail and rollback capability
 */

module.exports = (sequelize, DataTypes) => {
  const ImportBatch = sequelize.define('ImportBatch', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    created_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    source_type: {
      type: DataTypes.STRING(10),
      allowNull: false,
      validate: {
        isIn: [['csv', 'xls', 'xlsx']]
      }
    },
    original_file_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    file_size_bytes: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    sheet_name: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    mapping_preset_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    mapping_config_json: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    fx_rate_metadata: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    import_mode: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'skip-errors',
      validate: {
        isIn: [['skip-errors', 'all-or-nothing']]
      }
    },
    rows_total: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    rows_imported: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    rows_failed: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    rows_skipped_duplicates: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'pending',
      validate: {
        isIn: [['pending', 'processing', 'completed', 'completed_with_errors', 'failed', 'reverted']]
      }
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    error_report_json: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    reverted_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    reverted_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    revert_reason: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'inventory_import_batches',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  ImportBatch.associate = (models) => {
    ImportBatch.belongsTo(models.User, {
      as: 'createdBy',
      foreignKey: 'created_by_user_id'
    });
    ImportBatch.belongsTo(models.User, {
      as: 'revertedBy',
      foreignKey: 'reverted_by_user_id'
    });
    ImportBatch.hasMany(models.Asset, {
      as: 'assets',
      foreignKey: 'import_batch_id'
    });
  };

  return ImportBatch;
};
