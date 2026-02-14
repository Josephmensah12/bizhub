const { validateTaxonomyAsync } = require('../utils/inventoryTaxonomy');
const { Op, QueryTypes } = require('sequelize');

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
        min: 0
      },
      comment: 'On-hand quantity. Starts >= 1, decremented on payment, restored on void/return'
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
    // quantityRemaining removed — availability is now computed from invoice_items
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
    salesbinder_id: {
      type: DataTypes.STRING(50),
      allowNull: true,
      unique: true,
      comment: 'Original SalesBinder item ID for tracking imports'
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

  /**
   * Compute asset status from invoice_items (the source of truth).
   * - Has items on PAID invoice (non-voided) with no full returns → 'Sold'
   * - Has items on active non-PAID invoice (non-voided) → 'Processing'
   * - Otherwise → 'In Stock'
   */
  Asset.prototype.computeStatus = async function(transaction = null) {
    const queryOptions = { type: QueryTypes.SELECT };
    if (transaction) queryOptions.transaction = transaction;

    // Check for items on PAID invoices (not voided, not fully returned)
    const [paidResult] = await sequelize.query(
      `SELECT COUNT(*) AS cnt
       FROM invoice_items ii
       JOIN invoices i ON ii.invoice_id = i.id
       WHERE ii.asset_id = :assetId
         AND i.status = 'PAID'
         AND ii.voided_at IS NULL
         AND ii.quantity > ii.quantity_returned_total`,
      { replacements: { assetId: this.id }, ...queryOptions }
    );

    if (parseInt(paidResult.cnt) > 0) {
      return 'Sold';
    }

    // Check for items on active (UNPAID/PARTIALLY_PAID) invoices
    const [activeResult] = await sequelize.query(
      `SELECT COUNT(*) AS cnt
       FROM invoice_items ii
       JOIN invoices i ON ii.invoice_id = i.id
       WHERE ii.asset_id = :assetId
         AND i.status NOT IN ('CANCELLED', 'PAID')
         AND ii.voided_at IS NULL`,
      { replacements: { assetId: this.id }, ...queryOptions }
    );

    if (parseInt(activeResult.cnt) > 0) {
      return 'Processing';
    }

    return 'In Stock';
  };

  /**
   * Compute and save the asset status.
   */
  Asset.prototype.updateComputedStatus = async function(transaction = null) {
    const newStatus = await this.computeStatus(transaction);
    if (this.status !== newStatus) {
      this.status = newStatus;
      const saveOptions = transaction ? { transaction } : {};
      await this.save(saveOptions);
    }
    return this;
  };

  return Asset;
};
