const { validateTaxonomyAsync } = require('../utils/inventoryTaxonomy');

module.exports = (sequelize, DataTypes) => {
  const Asset = sequelize.define('Asset', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    asset_tag: {
      type: DataTypes.STRING(20),
      unique: true,
      allowNull: false,
      comment: 'Human-friendly unique ID like INV-000001'
    },
    category: {
      type: DataTypes.STRING(60),
      allowNull: false,
      comment: 'Taxonomy Level 1: Computer, Smartphone, Consumer Electronics, Appliance, or custom'
    },
    asset_type: {
      type: DataTypes.STRING(60),
      allowNull: false,
      comment: 'Taxonomy Level 2: Depends on category'
    },
    serial_number: {
      type: DataTypes.STRING(100),
      unique: true,
      allowNull: true,
      comment: 'Optional when quantity > 1 (multiple units cannot share one serial)'
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'In Stock',
      validate: {
        isIn: [['In Stock', 'Processing', 'Reserved', 'Sold', 'In Repair', 'Returned']]
      }
    },
    condition: {
      type: DataTypes.STRING(20),
      allowNull: true,
      validate: {
        isIn: [['New', 'Open Box', 'Renewed', 'Used']]
      }
    },
    quantity: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      allowNull: false,
      validate: {
        min: 1
      },
      comment: 'Number of units. Must be >= 1'
    },
    quantity_reserved: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
      comment: 'Units currently on open invoices (Processing)'
    },
    quantity_sold: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
      comment: 'Units on fully paid invoices'
    },
    quantity_returned: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
      comment: 'Units returned after sale'
    },
    quantityRemaining: {
      type: DataTypes.VIRTUAL,
      get() {
        return this.quantity - (this.quantity_reserved || 0) - (this.quantity_sold || 0) + (this.quantity_returned || 0);
      }
    },
    // Basic product fields
    make: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    model: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    product_category: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Freeform product category (e.g., Business Laptops)'
    },
    subcategory: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    specs: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    // Laptop/Desktop specific fields
    ram_gb: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 0
      }
    },
    storage_gb: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 0
      }
    },
    storage_type: {
      type: DataTypes.STRING(20),
      allowNull: true,
      validate: {
        isIn: [['HDD', 'SSD', 'NVMe', 'Other']]
      }
    },
    cpu: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    gpu: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    screen_size_inches: {
      type: DataTypes.DECIMAL(4, 2),
      allowNull: true,
      validate: {
        min: 0
      }
    },
    resolution: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    battery_health_percent: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 0,
        max: 100
      }
    },
    major_characteristics: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Array of tags like Touchscreen, 2-in-1, Backlit keyboard, etc.'
    },
    // Pricing fields
    cost_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      validate: {
        min: 0
      }
    },
    cost_currency: {
      type: DataTypes.STRING(3),
      defaultValue: 'USD',
      allowNull: false,
      comment: 'ISO 4217 currency code for cost',
      validate: {
        isIn: {
          args: [['USD', 'GHS', 'GBP']],
          msg: 'Cost currency must be USD, GHS, or GBP'
        }
      }
    },
    price_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      validate: {
        min: 0
      }
    },
    price_currency: {
      type: DataTypes.STRING(3),
      defaultValue: 'GHS',
      allowNull: false,
      comment: 'ISO 4217 currency code for selling price',
      validate: {
        isIn: {
          args: [['USD', 'GHS', 'GBP']],
          msg: 'Price currency must be USD, GHS, or GBP'
        }
      }
    },
    // Import tracking
    import_batch_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'References the bulk import batch this item was created in'
    },
    // Audit fields
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    updated_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    // Soft delete
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    deleted_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      },
      comment: 'User who deleted this asset (for audit trail)'
    }
  }, {
    tableName: 'assets',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    paranoid: true, // Enable soft delete
    deletedAt: 'deleted_at'
  });

  // Validate taxonomy combination before save (async — checks custom values too)
  Asset.beforeValidate(async (asset, options) => {
    if (asset.category && asset.asset_type) {
      const result = await validateTaxonomyAsync(asset.category, asset.asset_type);
      if (!result.valid) {
        throw new Error(result.error);
      }
    }
  });

  Asset.associate = (models) => {
    Asset.belongsTo(models.User, { as: 'creator', foreignKey: 'created_by' });
    Asset.belongsTo(models.User, { as: 'updater', foreignKey: 'updated_by' });
    Asset.belongsTo(models.User, { as: 'deleter', foreignKey: 'deleted_by' });
    Asset.belongsTo(models.ImportBatch, { as: 'importBatch', foreignKey: 'import_batch_id' });
    Asset.hasMany(models.InvoiceItem, { as: 'invoiceItems', foreignKey: 'asset_id' });
  };

  // Derive status from quantity breakdown
  Asset.prototype.deriveStatus = function() {
    const remaining = this.quantityRemaining;
    if (this.quantity_sold > 0 && remaining <= 0) return 'Sold';
    if (this.quantity_reserved > 0 && remaining <= 0) return 'Processing';
    return 'In Stock';
  };

  // Check if asset can be sold/reserved (quantity-based)
  Asset.prototype.canBeSold = function() {
    return this.quantityRemaining > 0 && !this.deleted_at;
  };

  // Reserve units for an invoice (caller must save with transaction)
  Asset.prototype.reserve = function(qty = 1) {
    if (qty > this.quantityRemaining) {
      throw new Error(`Insufficient quantity: ${this.quantityRemaining} available, ${qty} requested`);
    }
    this.quantity_reserved += qty;
    this.status = this.deriveStatus();
    return this;
  };

  // Mark units as sold — move from reserved → sold (caller must save with transaction)
  Asset.prototype.markAsSold = function(qty) {
    const units = qty || this.quantity_reserved;
    this.quantity_reserved = Math.max(0, this.quantity_reserved - units);
    this.quantity_sold += units;
    this.status = this.deriveStatus();
    return this;
  };

  // Restore reserved units to stock (caller must save with transaction)
  Asset.prototype.restoreToStock = function(qty) {
    const units = qty || this.quantity_reserved;
    this.quantity_reserved = Math.max(0, this.quantity_reserved - units);
    this.status = this.deriveStatus();
    return this;
  };

  // Process a return — move from sold back to available (caller must save with transaction)
  Asset.prototype.processReturn = function(qty = 1) {
    this.quantity_sold = Math.max(0, this.quantity_sold - qty);
    this.quantity_returned += qty;
    this.status = this.deriveStatus();
    return this;
  };

  return Asset;
};
