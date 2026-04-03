module.exports = (sequelize, DataTypes) => {
  const InvoiceAdjustment = sequelize.define('InvoiceAdjustment', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    invoice_id: { type: DataTypes.UUID, allowNull: false },
    adjusted_by_user_id: { type: DataTypes.INTEGER, allowNull: false },
    reason: { type: DataTypes.TEXT, allowNull: false },
    field_name: { type: DataTypes.STRING(50), allowNull: false },
    item_id: DataTypes.UUID,
    old_value: DataTypes.TEXT,
    new_value: DataTypes.TEXT,
    old_total: DataTypes.DECIMAL(12, 2),
    new_total: DataTypes.DECIMAL(12, 2),
  }, {
    tableName: 'invoice_adjustments',
    underscored: true,
  });

  InvoiceAdjustment.associate = (models) => {
    InvoiceAdjustment.belongsTo(models.Invoice, { foreignKey: 'invoice_id', as: 'invoice' });
    InvoiceAdjustment.belongsTo(models.User, { foreignKey: 'adjusted_by_user_id', as: 'adjustedBy' });
  };

  return InvoiceAdjustment;
};
