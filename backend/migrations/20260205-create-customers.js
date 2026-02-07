'use strict';

/**
 * Migration: Create customers table and customer_merge_log
 *
 * Customers table with:
 * - Identity fields (firstName/lastName/companyName)
 * - Contact fields (phone, whatsapp, email) with normalization
 * - CRM extras (tags, notes, heardAboutUs)
 * - Unique constraints on normalized contact fields
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create customers table
    await queryInterface.createTable('customers', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      // Identity
      first_name: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Required unless company_name is provided'
      },
      last_name: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      company_name: {
        type: Sequelize.STRING(200),
        allowNull: true,
        comment: 'Required unless first_name is provided'
      },
      // Phone
      phone_raw: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Original phone input'
      },
      phone_e164: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: 'Normalized E.164 format (e.g., +233244123456)'
      },
      // WhatsApp
      whatsapp_raw: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Original WhatsApp input'
      },
      whatsapp_e164: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: 'Normalized E.164 format'
      },
      whatsapp_same_as_phone: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'If true, WhatsApp mirrors phone'
      },
      // Email
      email: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Original email input'
      },
      email_lower: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Normalized lowercase trimmed email'
      },
      // Address
      address: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      // Heard About Us
      heard_about_us: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Instagram, Facebook, TikTok, Google Search/Maps, Walk-in/Signage, Referral, Campus Ambassador, WhatsApp Broadcast, Returning Customer, Other'
      },
      heard_about_us_other_text: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Only relevant when heard_about_us = Other'
      },
      // CRM Extras
      tags: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Array of tag strings'
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      // Audit
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      updated_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Unique partial index on phone_e164 (where not null)
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX idx_customers_phone_e164_unique
      ON customers (phone_e164)
      WHERE phone_e164 IS NOT NULL
    `);

    // Unique partial index on whatsapp_e164 (where not null)
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX idx_customers_whatsapp_e164_unique
      ON customers (whatsapp_e164)
      WHERE whatsapp_e164 IS NOT NULL
    `);

    // Unique partial index on email_lower (where not null)
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX idx_customers_email_lower_unique
      ON customers (email_lower)
      WHERE email_lower IS NOT NULL
    `);

    // Index for search
    await queryInterface.addIndex('customers', ['first_name', 'last_name'], {
      name: 'idx_customers_name'
    });
    await queryInterface.addIndex('customers', ['company_name'], {
      name: 'idx_customers_company'
    });
    await queryInterface.addIndex('customers', ['heard_about_us'], {
      name: 'idx_customers_heard_about'
    });
    await queryInterface.addIndex('customers', ['created_at'], {
      name: 'idx_customers_created_at'
    });

    // Create customer_merge_log table
    await queryInterface.createTable('customer_merge_log', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      merged_into_customer_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'customers',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      merged_from_customer_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'ID of customer that was merged (if existing customer)'
      },
      merged_from_payload_hash: {
        type: Sequelize.STRING(64),
        allowNull: true,
        comment: 'Hash of incoming data if from import (no existing customer ID)'
      },
      merged_by_user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      diff_json: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Changes made during merge'
      },
      merged_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('customer_merge_log', ['merged_into_customer_id'], {
      name: 'idx_merge_log_customer'
    });
    await queryInterface.addIndex('customer_merge_log', ['merged_at'], {
      name: 'idx_merge_log_date'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('customer_merge_log');
    await queryInterface.dropTable('customers');
  }
};
