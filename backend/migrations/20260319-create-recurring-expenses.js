'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('recurring_expenses', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
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
        allowNull: false
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
        comment: 'Historical FX basis preserved from setup'
      },
      amount_usd: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false
      },
      start_date: {
        type: Sequelize.DATEONLY,
        allowNull: false
      },
      end_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
        comment: 'Null = indefinite'
      },
      recurrence_frequency: {
        type: Sequelize.ENUM('monthly'),
        allowNull: false,
        defaultValue: 'monthly'
      },
      auto_post_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'If true, expenses auto-posted on generation'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      last_generated_period: {
        type: Sequelize.STRING(7),
        allowNull: true,
        comment: 'YYYY-MM of last auto-generated expense'
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

    await queryInterface.addIndex('recurring_expenses', ['category_id'], { name: 'idx_recurring_expenses_category' });
    await queryInterface.addIndex('recurring_expenses', ['is_active'], { name: 'idx_recurring_expenses_active' });

    // Add FK from expenses to recurring_expenses now that both tables exist
    await queryInterface.addConstraint('expenses', {
      fields: ['recurrence_group_id'],
      type: 'foreign key',
      name: 'fk_expenses_recurrence_group',
      references: { table: 'recurring_expenses', field: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint('expenses', 'fk_expenses_recurrence_group').catch(() => {});
    await queryInterface.dropTable('recurring_expenses');
  }
};
