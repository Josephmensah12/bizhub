'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('expense_categories', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true
      },
      is_sensitive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Sensitive categories (e.g. Salaries) visible only to Admin'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      sort_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()')
      }
    });

    // Seed default categories
    await queryInterface.bulkInsert('expense_categories', [
      { name: 'Rent', is_sensitive: false, is_active: true, sort_order: 1, created_at: new Date(), updated_at: new Date() },
      { name: 'Utilities', is_sensitive: false, is_active: true, sort_order: 2, created_at: new Date(), updated_at: new Date() },
      { name: 'Internet & Phone', is_sensitive: false, is_active: true, sort_order: 3, created_at: new Date(), updated_at: new Date() },
      { name: 'Office Supplies', is_sensitive: false, is_active: true, sort_order: 4, created_at: new Date(), updated_at: new Date() },
      { name: 'Transportation', is_sensitive: false, is_active: true, sort_order: 5, created_at: new Date(), updated_at: new Date() },
      { name: 'Marketing & Advertising', is_sensitive: false, is_active: true, sort_order: 6, created_at: new Date(), updated_at: new Date() },
      { name: 'Equipment & Maintenance', is_sensitive: false, is_active: true, sort_order: 7, created_at: new Date(), updated_at: new Date() },
      { name: 'Insurance', is_sensitive: false, is_active: true, sort_order: 8, created_at: new Date(), updated_at: new Date() },
      { name: 'Professional Services', is_sensitive: false, is_active: true, sort_order: 9, created_at: new Date(), updated_at: new Date() },
      { name: 'Salaries', is_sensitive: true, is_active: true, sort_order: 10, created_at: new Date(), updated_at: new Date() },
      { name: 'Taxes & Licenses', is_sensitive: false, is_active: true, sort_order: 11, created_at: new Date(), updated_at: new Date() },
      { name: 'Miscellaneous', is_sensitive: false, is_active: true, sort_order: 12, created_at: new Date(), updated_at: new Date() },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('expense_categories');
  }
};
