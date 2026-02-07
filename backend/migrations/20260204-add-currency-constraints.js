'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add CHECK constraints for currency fields
    await queryInterface.sequelize.query(`
      ALTER TABLE assets
      ADD CONSTRAINT check_cost_currency
      CHECK (cost_currency IN ('USD', 'GHS', 'GBP'));
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE assets
      ADD CONSTRAINT check_price_currency
      CHECK (price_currency IN ('USD', 'GHS', 'GBP'));
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE sales
      ADD CONSTRAINT check_sale_price_currency
      CHECK (sale_price_currency IN ('USD', 'GHS', 'GBP'));
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE sales
      ADD CONSTRAINT check_cost_currency_at_sale
      CHECK (cost_currency_at_sale IN ('USD', 'GHS', 'GBP'));
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE sales
      ADD CONSTRAINT check_fx_base_currency
      CHECK (fx_base_currency IS NULL OR fx_base_currency IN ('USD', 'GHS', 'GBP'));
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE sales
      ADD CONSTRAINT check_fx_quote_currency
      CHECK (fx_quote_currency IS NULL OR fx_quote_currency IN ('USD', 'GHS', 'GBP'));
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE exchange_rate_cache
      ADD CONSTRAINT check_base_currency
      CHECK (base_currency IN ('USD', 'GHS', 'GBP'));
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE exchange_rate_cache
      ADD CONSTRAINT check_quote_currency
      CHECK (quote_currency IN ('USD', 'GHS', 'GBP'));
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query('ALTER TABLE assets DROP CONSTRAINT IF EXISTS check_cost_currency;');
    await queryInterface.sequelize.query('ALTER TABLE assets DROP CONSTRAINT IF EXISTS check_price_currency;');
    await queryInterface.sequelize.query('ALTER TABLE sales DROP CONSTRAINT IF EXISTS check_sale_price_currency;');
    await queryInterface.sequelize.query('ALTER TABLE sales DROP CONSTRAINT IF EXISTS check_cost_currency_at_sale;');
    await queryInterface.sequelize.query('ALTER TABLE sales DROP CONSTRAINT IF EXISTS check_fx_base_currency;');
    await queryInterface.sequelize.query('ALTER TABLE sales DROP CONSTRAINT IF EXISTS check_fx_quote_currency;');
    await queryInterface.sequelize.query('ALTER TABLE exchange_rate_cache DROP CONSTRAINT IF EXISTS check_base_currency;');
    await queryInterface.sequelize.query('ALTER TABLE exchange_rate_cache DROP CONSTRAINT IF EXISTS check_quote_currency;');
  }
};
