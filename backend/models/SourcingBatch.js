module.exports = (sequelize, DataTypes) => {
  const SourcingBatch = sequelize.define('SourcingBatch', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    batch_reference: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    supplier_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    supplier_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'wholesale'
    },
    order_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    arrival_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    total_units: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    total_cost_usd: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      get() {
        const val = this.getDataValue('total_cost_usd');
        return val === null ? null : parseFloat(val);
      }
    },
    shipping_cost_per_unit_usd: {
      type: DataTypes.DECIMAL(8, 2),
      allowNull: true,
      get() {
        const val = this.getDataValue('shipping_cost_per_unit_usd');
        return val === null ? null : parseFloat(val);
      }
    },
    shipping_route: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    import_duty_rate: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: true,
      get() {
        const val = this.getDataValue('import_duty_rate');
        return val === null ? null : parseFloat(val);
      }
    },
    fx_rate_at_purchase: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: true,
      get() {
        const val = this.getDataValue('fx_rate_at_purchase');
        return val === null ? null : parseFloat(val);
      }
    },
    handling_per_unit_ghs: {
      type: DataTypes.DECIMAL(8, 2),
      allowNull: true,
      get() {
        const val = this.getDataValue('handling_per_unit_ghs');
        return val === null ? null : parseFloat(val);
      }
    },
    total_revenue_ghs: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      get() {
        const val = this.getDataValue('total_revenue_ghs');
        return val === null ? null : parseFloat(val);
      }
    },
    total_landed_cost_ghs: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      get() {
        const val = this.getDataValue('total_landed_cost_ghs');
        return val === null ? null : parseFloat(val);
      }
    },
    total_profit_ghs: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      get() {
        const val = this.getDataValue('total_profit_ghs');
        return val === null ? null : parseFloat(val);
      }
    },
    actual_margin_percent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      get() {
        const val = this.getDataValue('actual_margin_percent');
        return val === null ? null : parseFloat(val);
      }
    },
    projected_margin_percent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      get() {
        const val = this.getDataValue('projected_margin_percent');
        return val === null ? null : parseFloat(val);
      }
    },
    fx_rate_at_arrival: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: true,
      get() {
        const val = this.getDataValue('fx_rate_at_arrival');
        return val === null ? null : parseFloat(val);
      }
    },
    fx_impact_ghs: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      get() {
        const val = this.getDataValue('fx_impact_ghs');
        return val === null ? null : parseFloat(val);
      }
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'ordered'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    warranty_days: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    warranty_type: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    warranty_terms: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    warranty_expires_on: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' }
    }
  }, {
    tableName: 'sourcing_batches',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  /**
   * Compute the landed cost (GHS) for a single unit in this batch.
   * Formula: (cost_usd + shipping_per_unit) * (1 + duty_rate) * fx_rate + handling_per_unit
   */
  SourcingBatch.prototype.computeLandedCost = function (unitCostUsd) {
    const shipping = this.shipping_cost_per_unit_usd || 0;
    const duty = this.import_duty_rate || 0;
    const fx = this.fx_rate_at_purchase || 1;
    const handling = this.handling_per_unit_ghs || 0;
    return parseFloat(((unitCostUsd + shipping) * (1 + duty) * fx + handling).toFixed(2));
  };

  /**
   * Recompute batch-level totals from its units.
   * Call after unit prices change or units are sold.
   */
  SourcingBatch.prototype.recomputeTotals = async function (options = {}) {
    const { AssetUnit } = sequelize.models;
    const units = await AssetUnit.findAll({
      where: { sourcing_batch_id: this.id },
      ...(options.transaction ? { transaction: options.transaction } : {})
    });

    let totalRevenue = 0;
    let totalLanded = 0;
    let soldCount = 0;

    for (const u of units) {
      const landed = parseFloat(u.landed_cost_ghs) || 0;
      totalLanded += landed;
      if (u.status === 'Sold' && u.actual_sell_price_ghs) {
        totalRevenue += parseFloat(u.actual_sell_price_ghs);
        soldCount++;
      }
    }

    this.total_units = units.length;
    this.total_landed_cost_ghs = parseFloat(totalLanded.toFixed(2));
    this.total_revenue_ghs = parseFloat(totalRevenue.toFixed(2));
    this.total_profit_ghs = parseFloat((totalRevenue - totalLanded).toFixed(2));
    this.actual_margin_percent = totalRevenue > 0
      ? parseFloat(((totalRevenue - totalLanded) / totalRevenue * 100).toFixed(2))
      : null;

    await this.save(options.transaction ? { transaction: options.transaction } : {});
  };

  SourcingBatch.associate = (models) => {
    SourcingBatch.hasMany(models.AssetUnit, { foreignKey: 'sourcing_batch_id', as: 'units' });
    SourcingBatch.hasMany(models.WarrantyClaim, { foreignKey: 'sourcing_batch_id', as: 'warrantyClaims' });
    SourcingBatch.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
  };

  return SourcingBatch;
};
