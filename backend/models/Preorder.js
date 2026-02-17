/**
 * Preorder Model
 *
 * Simple preorder tracking with customer-facing status portal.
 */

const PREORDER_STATUSES = ['Deposit Paid', 'Purchased', 'Shipped', 'Arrived', 'Completed', 'Cancelled'];
const SHIPPING_METHODS = ['air', 'sea', 'other'];

module.exports = (sequelize, DataTypes) => {
  const Preorder = sequelize.define('Preorder', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    tracking_code: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    customer_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    customer_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    customer_phone: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    customer_email: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    item_description: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },

    // --- Internal/Admin fields ---
    source_url: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    source_notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    purchase_cost_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      get() {
        const val = this.getDataValue('purchase_cost_amount');
        return val === null ? null : parseFloat(val);
      }
    },
    purchase_cost_currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'USD'
    },
    purchase_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    supplier_order_number: {
      type: DataTypes.STRING(100),
      allowNull: true
    },

    // --- Shipping ---
    shipping_method: {
      type: DataTypes.ENUM(...SHIPPING_METHODS),
      allowNull: true
    },
    tracking_number: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    shipped_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    estimated_arrival_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    actual_arrival_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },

    // --- Pricing (customer-facing) ---
    selling_price: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      get() {
        const val = this.getDataValue('selling_price');
        return val === null ? null : parseFloat(val);
      }
    },
    deposit_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      get() {
        const val = this.getDataValue('deposit_amount');
        return val === null ? 0 : parseFloat(val);
      }
    },
    deposit_payment_method: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    balance_due: {
      type: DataTypes.VIRTUAL,
      get() {
        const selling = parseFloat(this.getDataValue('selling_price')) || 0;
        const deposit = parseFloat(this.getDataValue('deposit_amount')) || 0;
        return Math.round((selling - deposit) * 100) / 100;
      }
    },

    // --- Status ---
    status: {
      type: DataTypes.ENUM(...PREORDER_STATUSES),
      allowNull: false,
      defaultValue: 'Deposit Paid'
    },
    status_message: {
      type: DataTypes.STRING(255),
      allowNull: true
    },

    // --- Conversion ---
    invoice_id: {
      type: DataTypes.UUID,
      allowNull: true
    },

    // --- Audit ---
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    updated_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    tableName: 'preorders',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { unique: true, fields: ['tracking_code'] },
      { fields: ['customer_phone'] },
      { fields: ['status'] }
    ]
  });

  Preorder.associate = (models) => {
    Preorder.belongsTo(models.Customer, { as: 'customer', foreignKey: 'customer_id' });
    Preorder.belongsTo(models.Invoice, { as: 'invoice', foreignKey: 'invoice_id' });
    Preorder.belongsTo(models.User, { as: 'creator', foreignKey: 'created_by' });
    Preorder.belongsTo(models.User, { as: 'updater', foreignKey: 'updated_by' });
  };

  Preorder.STATUSES = PREORDER_STATUSES;
  Preorder.SHIPPING_METHODS = SHIPPING_METHODS;

  /**
   * Generate next tracking code: PO-00001, PO-00002, ...
   */
  Preorder.generateTrackingCode = async function () {
    const [results] = await sequelize.query(
      "SELECT tracking_code FROM preorders ORDER BY id DESC LIMIT 1"
    );
    let next = 1;
    if (results.length > 0) {
      const last = results[0].tracking_code; // e.g. "PO-00042"
      const num = parseInt(last.replace('PO-', ''), 10);
      if (!isNaN(num)) next = num + 1;
    }
    return `PO-${String(next).padStart(5, '0')}`;
  };

  return Preorder;
};
