'use strict';

/**
 * Migration: Add PDF fields to invoices
 *
 * Adds pdf_access_token and pdf_generated_at for secure PDF sharing
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('invoices', 'pdf_access_token', {
      type: Sequelize.STRING(64),
      allowNull: true
    });

    await queryInterface.addColumn('invoices', 'pdf_generated_at', {
      type: Sequelize.DATE,
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('invoices', 'pdf_access_token');
    await queryInterface.removeColumn('invoices', 'pdf_generated_at');
  }
};
