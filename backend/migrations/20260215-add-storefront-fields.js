'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Helper: check if column already exists
    const columnExists = async (table, column) => {
      const [results] = await queryInterface.sequelize.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = '${table}' AND column_name = '${column}'`
      );
      return results.length > 0;
    };

    // 1. Add 'source' to invoices
    if (!(await columnExists('invoices', 'source'))) {
      await queryInterface.addColumn('invoices', 'source', {
        type: Sequelize.STRING(20),
        allowNull: true,
        defaultValue: 'in_store'
      });
    }

    // 2. Add 'payment_reference' to invoices (Paystack reference etc.)
    if (!(await columnExists('invoices', 'payment_reference'))) {
      await queryInterface.addColumn('invoices', 'payment_reference', {
        type: Sequelize.STRING(100),
        allowNull: true
      });
    }

    // 3. Add 'payment_method' to invoices (invoice-level payment method)
    if (!(await columnExists('invoices', 'payment_method'))) {
      await queryInterface.addColumn('invoices', 'payment_method', {
        type: Sequelize.STRING(20),
        allowNull: true
      });
    }

    // 4. Add 'featured' to assets
    if (!(await columnExists('assets', 'featured'))) {
      await queryInterface.addColumn('assets', 'featured', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }

    // 5. Add 'payment_reference' to invoice_payments (gateway reference)
    if (!(await columnExists('invoice_payments', 'payment_reference'))) {
      await queryInterface.addColumn('invoice_payments', 'payment_reference', {
        type: Sequelize.STRING(100),
        allowNull: true
      });
    }
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('invoices', 'source').catch(() => {});
    await queryInterface.removeColumn('invoices', 'payment_reference').catch(() => {});
    await queryInterface.removeColumn('invoices', 'payment_method').catch(() => {});
    await queryInterface.removeColumn('assets', 'featured').catch(() => {});
    await queryInterface.removeColumn('invoice_payments', 'payment_reference').catch(() => {});
  }
};
