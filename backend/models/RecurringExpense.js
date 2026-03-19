module.exports = (sequelize, DataTypes) => {
  const RecurringExpense = sequelize.define('RecurringExpense', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
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
    start_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    end_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    recurrence_frequency: {
      type: DataTypes.ENUM('monthly'),
      allowNull: false,
      defaultValue: 'monthly'
    },
    auto_post_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    last_generated_period: {
      type: DataTypes.STRING(7),
      allowNull: true
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    tableName: 'recurring_expenses',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  RecurringExpense.associate = (models) => {
    RecurringExpense.belongsTo(models.ExpenseCategory, { foreignKey: 'category_id', as: 'category' });
    RecurringExpense.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
    RecurringExpense.hasMany(models.Expense, { foreignKey: 'recurrence_group_id', as: 'generatedExpenses' });
  };

  return RecurringExpense;
};
