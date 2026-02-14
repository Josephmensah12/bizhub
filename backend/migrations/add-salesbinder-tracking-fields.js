/**
 * Add SalesBinder tracking fields for import deduplication
 */

'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add salesbinder_id to customers table
    await queryInterface.addColumn('customers', 'salesbinder_id', {
      type: Sequelize.STRING(50),
      allowNull: true,
      unique: true,
      comment: 'Original SalesBinder customer ID for tracking imports'
    });

    // Add salesbinder_id to assets table  
    await queryInterface.addColumn('assets', 'salesbinder_id', {
      type: Sequelize.STRING(50),
      allowNull: true,
      unique: true,
      comment: 'Original SalesBinder item ID for tracking imports'
    });

    // Add salesbinder tracking fields to invoices table
    await queryInterface.addColumn('invoices', 'salesbinder_id', {
      type: Sequelize.STRING(50),
      allowNull: true,
      unique: true,
      comment: 'Original SalesBinder invoice ID for tracking imports'
    });

    await queryInterface.addColumn('invoices', 'salesbinder_invoice_number', {
      type: Sequelize.STRING(20),
      allowNull: true,
      comment: 'Original SalesBinder invoice number for reference'
    });

    // Add indexes for better query performance
    await queryInterface.addIndex('customers', ['salesbinder_id']);
    await queryInterface.addIndex('assets', ['salesbinder_id']);
    await queryInterface.addIndex('invoices', ['salesbinder_id']);
    await queryInterface.addIndex('invoices', ['salesbinder_invoice_number']);
  },

  async down(queryInterface, Sequelize) {
    // Remove indexes first
    await queryInterface.removeIndex('customers', ['salesbinder_id']);
    await queryInterface.removeIndex('assets', ['salesbinder_id']);
    await queryInterface.removeIndex('invoices', ['salesbinder_id']);
    await queryInterface.removeIndex('invoices', ['salesbinder_invoice_number']);

    // Remove columns
    await queryInterface.removeColumn('customers', 'salesbinder_id');
    await queryInterface.removeColumn('assets', 'salesbinder_id');
    await queryInterface.removeColumn('invoices', 'salesbinder_id');
    await queryInterface.removeColumn('invoices', 'salesbinder_invoice_number');
  }
};