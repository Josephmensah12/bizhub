/**
 * InventoryWriteOff Model
 *
 * Tracks inventory write-offs for damaged, lost, obsolete, stolen, or expired assets.
 */

const WRITE_OFF_REASONS = ['damaged', 'lost', 'obsolete', 'stolen', 'expired', 'other'];
const WRITE_OFF_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'REVERSED'];

module.exports = (sequelize, DataTypes) => {
  const InventoryWriteOff = sequelize.define('InventoryWriteOff', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    write_off_number: {
      type: DataTypes.STRING(30),
      allowNull: false
    },
    asset_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    asset_unit_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    reason: {
      type: DataTypes.ENUM(...WRITE_OFF_REASONS),
      allowNull: false
    },
    reason_detail: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    unit_cost_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      get() {
        const val = this.getDataValue('unit_cost_amount');
        return val === null ? null : parseFloat(val);
      }
    },
    total_cost_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      get() {
        const val = this.getDataValue('total_cost_amount');
        return val === null ? null : parseFloat(val);
      }
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'GHS'
    },
    status: {
      type: DataTypes.ENUM(...WRITE_OFF_STATUSES),
      allowNull: false,
      defaultValue: 'PENDING'
    },
    approved_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    approved_at: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    rejected_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    rejected_at: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    rejection_reason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    reversed_at: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    reversed_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    reversal_reason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    tableName: 'inventory_write_offs',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { unique: true, fields: ['write_off_number'] }
    ]
  });

  InventoryWriteOff.associate = (models) => {
    InventoryWriteOff.belongsTo(models.Asset, { as: 'asset', foreignKey: 'asset_id' });
    InventoryWriteOff.belongsTo(models.AssetUnit, { as: 'assetUnit', foreignKey: 'asset_unit_id' });
    InventoryWriteOff.belongsTo(models.User, { as: 'creator', foreignKey: 'created_by' });
    InventoryWriteOff.belongsTo(models.User, { as: 'approver', foreignKey: 'approved_by' });
    InventoryWriteOff.belongsTo(models.User, { as: 'rejector', foreignKey: 'rejected_by' });
    InventoryWriteOff.belongsTo(models.User, { as: 'reverser', foreignKey: 'reversed_by' });
  };

  // Static constants
  InventoryWriteOff.REASONS = WRITE_OFF_REASONS;
  InventoryWriteOff.STATUSES = WRITE_OFF_STATUSES;

  // Generate write-off number (pattern: WO-000001)
  InventoryWriteOff.generateWriteOffNumber = async function() {
    const [results] = await sequelize.query(
      `SELECT write_off_number FROM inventory_write_offs
       ORDER BY write_off_number DESC LIMIT 1`
    );

    let nextSeq = 1;
    if (results.length > 0) {
      const lastNumber = results[0].write_off_number;
      const match = lastNumber.match(/WO-(\d+)/);
      if (match) {
        nextSeq = parseInt(match[1], 10) + 1;
      }
    }

    return `WO-${String(nextSeq).padStart(6, '0')}`;
  };

  // Instance methods
  InventoryWriteOff.prototype.isPending = function() {
    return this.status === 'PENDING';
  };

  InventoryWriteOff.prototype.isApproved = function() {
    return this.status === 'APPROVED';
  };

  InventoryWriteOff.prototype.isRejected = function() {
    return this.status === 'REJECTED';
  };

  InventoryWriteOff.prototype.isReversed = function() {
    return this.status === 'REVERSED';
  };

  return InventoryWriteOff;
};
