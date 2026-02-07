'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('exchange_rate_cache', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      base_currency: {
        type: Sequelize.STRING(3),
        allowNull: false
      },
      quote_currency: {
        type: Sequelize.STRING(3),
        allowNull: false
      },
      rate_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
        comment: 'Date for which this rate is valid'
      },
      rate: {
        type: Sequelize.DECIMAL(18, 8),
        allowNull: false
      },
      source: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'FX provider name (e.g., exchangerate-api, manual)'
      },
      is_manual_override: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      fetched_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
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

    // Add unique index for caching key
    await queryInterface.addIndex('exchange_rate_cache',
      ['base_currency', 'quote_currency', 'rate_date'],
      {
        unique: true,
        name: 'idx_fx_cache_unique'
      }
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('exchange_rate_cache');
  }
};
