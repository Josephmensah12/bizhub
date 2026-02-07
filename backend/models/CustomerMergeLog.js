/**
 * CustomerMergeLog Model
 *
 * Audit log for customer merge operations
 */

module.exports = (sequelize, DataTypes) => {
  const CustomerMergeLog = sequelize.define('CustomerMergeLog', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    merged_into_customer_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    merged_from_customer_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'ID of customer that was merged (if existing)'
    },
    merged_from_payload_hash: {
      type: DataTypes.STRING(64),
      allowNull: true,
      comment: 'Hash of incoming data if from import'
    },
    merged_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    diff_json: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Changes made during merge'
    },
    merged_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'customer_merge_log',
    underscored: true,
    timestamps: false
  });

  CustomerMergeLog.associate = (models) => {
    CustomerMergeLog.belongsTo(models.Customer, {
      as: 'targetCustomer',
      foreignKey: 'merged_into_customer_id'
    });
    CustomerMergeLog.belongsTo(models.User, {
      as: 'mergedBy',
      foreignKey: 'merged_by_user_id'
    });
  };

  return CustomerMergeLog;
};
