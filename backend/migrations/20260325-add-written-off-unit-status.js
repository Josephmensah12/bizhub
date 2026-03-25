'use strict';

module.exports = {
  async up(queryInterface) {
    // Add 'Written Off' to the asset_units status enum
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_asset_units_status" ADD VALUE IF NOT EXISTS 'Written Off'`
    );
  },

  async down() {
    // Enum values cannot be removed in PostgreSQL without recreating the type
  }
};
