'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('sales', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      asset_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'assets',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      sale_date: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      sale_price_amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false
      },
      sale_price_currency: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'GHS'
      },
      cost_amount_at_sale: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        comment: 'Historical cost at time of sale'
      },
      cost_currency_at_sale: {
        type: Sequelize.STRING(3),
        allowNull: false,
        comment: 'Historical cost currency'
      },
      fx_rate_source: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'FX provider name'
      },
      fx_base_currency: {
        type: Sequelize.STRING(3),
        allowNull: true,
        comment: 'Base currency for FX conversion'
      },
      fx_quote_currency: {
        type: Sequelize.STRING(3),
        allowNull: true,
        comment: 'Quote currency for FX conversion'
      },
      fx_rate_fetched: {
        type: Sequelize.DECIMAL(18, 8),
        allowNull: true,
        comment: 'Raw fetched exchange rate'
      },
      fx_rate_markup: {
        type: Sequelize.DECIMAL(18, 8),
        allowNull: true,
        defaultValue: 0.5,
        comment: 'Markup applied to FX rate'
      },
      fx_rate_used: {
        type: Sequelize.DECIMAL(18, 8),
        allowNull: true,
        comment: 'Final rate used (fetched + markup)'
      },
      fx_fetched_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When FX rate was fetched'
      },
      cost_in_sale_currency: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        comment: 'Converted cost in sale currency'
      },
      margin_amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        comment: 'Sale price - cost (in sale currency)'
      },
      margin_percent: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true,
        comment: 'Margin as percentage of sale price'
      },
      customer_name: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      customer_contact: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        }
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Add indexes
    await queryInterface.addIndex('sales', ['asset_id']);
    await queryInterface.addIndex('sales', ['sale_date']);
    await queryInterface.addIndex('sales', ['created_by']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('sales');
  }
};
