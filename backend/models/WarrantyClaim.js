module.exports = (sequelize, DataTypes) => {
  const WarrantyClaim = sequelize.define('WarrantyClaim', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4
    },
    sourcing_batch_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'sourcing_batches', key: 'id' }
    },
    asset_unit_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'asset_units', key: 'id' }
    },
    claim_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    defect_type: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    defect_description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    evidence_photos: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'open'
    },
    resolution_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    resolution_type: {
      type: DataTypes.STRING(30),
      allowNull: true
    },
    refund_amount_usd: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      get() {
        const val = this.getDataValue('refund_amount_usd');
        return val === null ? null : parseFloat(val);
      }
    },
    refund_amount_ghs: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      get() {
        const val = this.getDataValue('refund_amount_ghs');
        return val === null ? null : parseFloat(val);
      }
    },
    replacement_unit_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'asset_units', key: 'id' }
    },
    supplier_reference: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' }
    }
  }, {
    tableName: 'warranty_claims',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  WarrantyClaim.associate = (models) => {
    WarrantyClaim.belongsTo(models.SourcingBatch, { foreignKey: 'sourcing_batch_id', as: 'batch' });
    WarrantyClaim.belongsTo(models.AssetUnit, { foreignKey: 'asset_unit_id', as: 'unit' });
    WarrantyClaim.belongsTo(models.AssetUnit, { foreignKey: 'replacement_unit_id', as: 'replacementUnit' });
    WarrantyClaim.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
  };

  return WarrantyClaim;
};
