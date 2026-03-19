'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('expenses', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      expense_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
        comment: 'Date the expense was incurred'
      },
      recognition_period: {
        type: Sequelize.STRING(7),
        allowNull: false,
        comment: 'YYYY-MM format for P&L period recognition'
      },
      category_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'expense_categories', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      description: {
        type: Sequelize.STRING(500),
        allowNull: false
      },
      vendor_or_payee: {
        type: Sequelize.STRING(200),
        allowNull: true
      },
      amount_local: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        comment: 'Amount in original currency'
      },
      currency_code: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'GHS'
      },
      exchange_rate_used: {
        type: Sequelize.DECIMAL(18, 8),
        allowNull: false,
        defaultValue: 1,
        comment: 'Historical FX rate at time of expense (to USD)'
      },
      amount_usd: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        comment: 'Computed: amount_local / exchange_rate_used (or * if rate is per-USD)'
      },
      expense_type: {
        type: Sequelize.ENUM('one_time', 'fixed_recurring'),
        allowNull: false,
        defaultValue: 'one_time'
      },
      source_type: {
        type: Sequelize.ENUM('manual', 'auto_generated_recurring'),
        allowNull: false,
        defaultValue: 'manual'
      },
      recurrence_group_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Links to recurring_expenses.id if auto-generated'
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
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

    await queryInterface.addIndex('expenses', ['expense_date'], { name: 'idx_expenses_date' });
    await queryInterface.addIndex('expenses', ['recognition_period'], { name: 'idx_expenses_recognition' });
    await queryInterface.addIndex('expenses', ['category_id'], { name: 'idx_expenses_category' });
    await queryInterface.addIndex('expenses', ['created_by'], { name: 'idx_expenses_created_by' });
    await queryInterface.addIndex('expenses', ['recurrence_group_id'], { name: 'idx_expenses_recurrence_group' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('expenses');
  }
};
