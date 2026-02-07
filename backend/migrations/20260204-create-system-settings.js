'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('system_settings', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      setting_key: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true
      },
      setting_value: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      setting_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'string',
        comment: 'string, number, boolean, json'
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
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

    // Insert default settings
    await queryInterface.bulkInsert('system_settings', [
      {
        setting_key: 'default_cost_currency',
        setting_value: 'USD',
        setting_type: 'string',
        description: 'Default currency for inventory costs'
      },
      {
        setting_key: 'default_sale_currency',
        setting_value: 'GHS',
        setting_type: 'string',
        description: 'Default currency for sales'
      },
      {
        setting_key: 'fx_rate_markup',
        setting_value: '0.5',
        setting_type: 'number',
        description: 'Default markup applied to FX rates (in quote currency units per base unit)'
      },
      {
        setting_key: 'allowed_currencies',
        setting_value: JSON.stringify(['USD', 'GHS', 'EUR', 'GBP']),
        setting_type: 'json',
        description: 'List of allowed ISO 4217 currency codes'
      },
      {
        setting_key: 'fx_provider',
        setting_value: 'exchangerate-api',
        setting_type: 'string',
        description: 'FX rate provider service name'
      }
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('system_settings');
  }
};
