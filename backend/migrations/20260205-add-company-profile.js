'use strict';

/**
 * Migration: Add Company Profile Table
 *
 * Stores company information for branded invoices and documents
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('company_profiles', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      company_name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      tagline: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      address_line_1: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      address_line_2: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      city: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      region_state: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      country: {
        type: Sequelize.STRING(100),
        allowNull: true,
        defaultValue: 'Ghana'
      },
      phone: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      whatsapp: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      website: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      tax_id_or_tin: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      notes_footer: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      logo_url: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      logo_storage_key: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      logo_mime_type: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      updated_by_user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      }
    });

    // Ensure only one active profile exists
    await queryInterface.addIndex('company_profiles', ['is_active'], {
      name: 'idx_company_profiles_active',
      where: { is_active: true }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('company_profiles');
  }
};
