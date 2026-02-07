'use strict';

/**
 * Migration: Create Customer Credit Applications Table
 *
 * Tracks when store credits are applied to invoices
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('customer_credit_applications', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      credit_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'customer_credits',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      invoice_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'invoices',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      amount_applied: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false
      },
      applied_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      applied_by_user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      voided_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      voided_by_user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      void_reason: {
        type: Sequelize.TEXT,
        allowNull: true
      }
    });

    // Add indexes
    await queryInterface.addIndex('customer_credit_applications', ['credit_id'], {
      name: 'idx_credit_applications_credit'
    });

    await queryInterface.addIndex('customer_credit_applications', ['invoice_id'], {
      name: 'idx_credit_applications_invoice'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('customer_credit_applications');
  }
};
