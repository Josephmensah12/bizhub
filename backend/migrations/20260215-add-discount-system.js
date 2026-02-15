'use strict';

/**
 * Add full discount system to invoices and invoice_items.
 *
 * invoices:      discount_percent, discount_amount, discount_type, discount_value
 * invoice_items: discount_type, discount_value, discount_amount, pre_discount_total
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // --- invoices: add discount_percent & discount_amount (base columns) ---
    await queryInterface.addColumn('invoices', 'discount_percent', {
      type: Sequelize.DECIMAL(8, 4),
      allowNull: true,
      defaultValue: 0
    });
    await queryInterface.addColumn('invoices', 'discount_amount', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0
    });

    // --- invoices: add discount_type & discount_value (new discount system) ---
    await queryInterface.addColumn('invoices', 'discount_type', {
      type: Sequelize.ENUM('none', 'percentage', 'fixed'),
      allowNull: false,
      defaultValue: 'none'
    });
    await queryInterface.addColumn('invoices', 'discount_value', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0
    });

    // --- invoice_items columns ---
    await queryInterface.addColumn('invoice_items', 'discount_type', {
      type: Sequelize.ENUM('none', 'percentage', 'fixed'),
      allowNull: false,
      defaultValue: 'none'
    });
    await queryInterface.addColumn('invoice_items', 'discount_value', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0
    });
    await queryInterface.addColumn('invoice_items', 'discount_amount', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0
    });
    await queryInterface.addColumn('invoice_items', 'pre_discount_total', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: true
    });
  },

  async down(queryInterface) {
    // invoice_items
    await queryInterface.removeColumn('invoice_items', 'discount_type');
    await queryInterface.removeColumn('invoice_items', 'discount_value');
    await queryInterface.removeColumn('invoice_items', 'discount_amount');
    await queryInterface.removeColumn('invoice_items', 'pre_discount_total');

    // invoices
    await queryInterface.removeColumn('invoices', 'discount_type');
    await queryInterface.removeColumn('invoices', 'discount_value');
    await queryInterface.removeColumn('invoices', 'discount_percent');
    await queryInterface.removeColumn('invoices', 'discount_amount');

    // Clean up ENUM types
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_invoice_items_discount_type";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_invoices_discount_type";');
  }
};
