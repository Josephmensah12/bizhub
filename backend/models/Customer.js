/**
 * Customer Model
 *
 * Mini-CRM customer with contact normalization and unique constraints
 */

const { normalizePhone, normalizeEmail } = require('../utils/phoneNormalizer');

// Heard About Us options
const HEARD_ABOUT_US_OPTIONS = [
  'Instagram',
  'Facebook',
  'TikTok',
  'Google Search/Maps',
  'Walk-in/Signage',
  'Referral',
  'Campus Ambassador',
  'WhatsApp Broadcast',
  'Returning Customer',
  'Other'
];

module.exports = (sequelize, DataTypes) => {
  const Customer = sequelize.define('Customer', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    // Identity
    first_name: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'first_name'
    },
    last_name: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'last_name'
    },
    company_name: {
      type: DataTypes.STRING(200),
      allowNull: true,
      field: 'company_name'
    },
    // Phone
    phone_raw: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    phone_e164: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    // WhatsApp
    whatsapp_raw: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    whatsapp_e164: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    whatsapp_same_as_phone: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    // Email
    email: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    email_lower: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    // Address
    address: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    // Heard About Us
    heard_about_us: {
      type: DataTypes.STRING(50),
      allowNull: true,
      validate: {
        isIn: {
          args: [HEARD_ABOUT_US_OPTIONS],
          msg: `heard_about_us must be one of: ${HEARD_ABOUT_US_OPTIONS.join(', ')}`
        }
      }
    },
    heard_about_us_other_text: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    // CRM Extras
    tags: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: []
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    // Import tracking
    salesbinder_id: {
      type: DataTypes.STRING(50),
      allowNull: true,
      unique: true,
      comment: 'Original SalesBinder customer ID for tracking imports'
    },
    // Audit
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    updated_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    tableName: 'customers',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  // Virtual for display name
  Customer.prototype.getDisplayName = function() {
    if (this.first_name && this.last_name) {
      return `${this.first_name} ${this.last_name}`;
    }
    if (this.first_name) {
      return this.first_name;
    }
    if (this.company_name) {
      return this.company_name;
    }
    return 'Unknown';
  };

  // Validate: must have either firstName or companyName
  Customer.beforeValidate((customer, options) => {
    const firstName = customer.first_name?.trim();
    const companyName = customer.company_name?.trim();

    if (!firstName && !companyName) {
      throw new Error('Either first_name or company_name is required');
    }
  });

  // Auto-normalize contacts before save
  Customer.beforeSave((customer, options) => {
    // Normalize phone
    if (customer.changed('phone_raw') || !customer.phone_e164) {
      if (customer.phone_raw) {
        const phoneResult = normalizePhone(customer.phone_raw);
        customer.phone_e164 = phoneResult.e164;
      } else {
        customer.phone_e164 = null;
      }
    }

    // Handle WhatsApp
    if (customer.whatsapp_same_as_phone) {
      // Mirror phone to WhatsApp
      customer.whatsapp_raw = customer.phone_raw;
      customer.whatsapp_e164 = customer.phone_e164;
    } else if (customer.changed('whatsapp_raw') || !customer.whatsapp_e164) {
      if (customer.whatsapp_raw) {
        const whatsappResult = normalizePhone(customer.whatsapp_raw);
        customer.whatsapp_e164 = whatsappResult.e164;
      } else {
        customer.whatsapp_e164 = null;
      }
    }

    // Normalize email
    if (customer.changed('email') || !customer.email_lower) {
      if (customer.email) {
        const emailResult = normalizeEmail(customer.email);
        customer.email_lower = emailResult.lower;
      } else {
        customer.email_lower = null;
      }
    }
  });

  Customer.associate = (models) => {
    Customer.belongsTo(models.User, { as: 'creator', foreignKey: 'created_by' });
    Customer.belongsTo(models.User, { as: 'updater', foreignKey: 'updated_by' });
  };

  // Static: Get heard about us options
  Customer.HEARD_ABOUT_US_OPTIONS = HEARD_ABOUT_US_OPTIONS;

  return Customer;
};
