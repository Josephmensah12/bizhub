module.exports = (sequelize, DataTypes) => {
  const Expense = sequelize.define('Expense', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    expense_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    recognition_period: {
      type: DataTypes.STRING(7),
      allowNull: false,
      comment: 'YYYY-MM for P&L recognition'
    },
    category_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    description: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    vendor_or_payee: {
      type: DataTypes.STRING(200),
      allowNull: true
    },
    amount_local: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      get() {
        const val = this.getDataValue('amount_local');
        return val === null ? null : parseFloat(val);
      }
    },
    currency_code: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'GHS'
    },
    exchange_rate_used: {
      type: DataTypes.DECIMAL(18, 8),
      allowNull: false,
      defaultValue: 1,
      get() {
        const val = this.getDataValue('exchange_rate_used');
        return val === null ? null : parseFloat(val);
      }
    },
    amount_usd: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      get() {
        const val = this.getDataValue('amount_usd');
        return val === null ? null : parseFloat(val);
      }
    },
    expense_type: {
      type: DataTypes.ENUM('one_time', 'fixed_recurring'),
      allowNull: false,
      defaultValue: 'one_time'
    },
    source_type: {
      type: DataTypes.ENUM('manual', 'auto_generated_recurring'),
      allowNull: false,
      defaultValue: 'manual'
    },
    recurrence_group_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    tableName: 'expenses',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  Expense.associate = (models) => {
    Expense.belongsTo(models.ExpenseCategory, { foreignKey: 'category_id', as: 'category' });
    Expense.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
    Expense.belongsTo(models.RecurringExpense, { foreignKey: 'recurrence_group_id', as: 'recurringExpense' });
  };

  return Expense;
};
