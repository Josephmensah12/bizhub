'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CompanyProfile extends Model {
    static associate(models) {
      CompanyProfile.belongsTo(models.User, {
        foreignKey: 'updated_by_user_id',
        as: 'updatedBy'
      });
    }

    /**
     * Get formatted full address
     */
    getFullAddress() {
      const parts = [];
      if (this.address_line_1) parts.push(this.address_line_1);
      if (this.address_line_2) parts.push(this.address_line_2);
      if (this.city) parts.push(this.city);
      if (this.region_state) parts.push(this.region_state);
      if (this.country) parts.push(this.country);
      return parts.join(', ');
    }

    /**
     * Get contact info object
     */
    getContactInfo() {
      return {
        phone: this.phone,
        whatsapp: this.whatsapp,
        email: this.email,
        website: this.website
      };
    }
  }

  CompanyProfile.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    company_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'Company name is required'
        }
      }
    },
    tagline: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    address_line_1: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    address_line_2: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    city: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    region_state: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    country: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: 'Ghana'
    },
    phone: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    whatsapp: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
      validate: {
        isEmail: {
          msg: 'Please enter a valid email address'
        }
      }
    },
    website: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    tax_id_or_tin: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    notes_footer: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    logo_url: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    logo_storage_key: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    logo_mime_type: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    updated_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'CompanyProfile',
    tableName: 'company_profiles',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return CompanyProfile;
};
