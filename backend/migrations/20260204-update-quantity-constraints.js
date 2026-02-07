'use strict';

/**
 * Migration: Update quantity field constraints
 * - Change default from 0 to 1
 * - Add check constraint: quantity >= 1
 * - Make serial_number nullable (for quantity > 1 cases)
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Update existing assets with quantity 0 to 1
    await queryInterface.sequelize.query(`
      UPDATE assets SET quantity = 1 WHERE quantity = 0 OR quantity IS NULL
    `);

    // Change quantity default to 1 and add constraint
    await queryInterface.changeColumn('assets', 'quantity', {
      type: Sequelize.INTEGER,
      defaultValue: 1,
      allowNull: false
    });

    // Add check constraint for quantity >= 1
    await queryInterface.sequelize.query(`
      ALTER TABLE assets ADD CONSTRAINT check_quantity_min
      CHECK (quantity >= 1)
    `);

    // Make serial_number nullable (for quantity > 1 cases where serial doesn't apply)
    await queryInterface.changeColumn('assets', 'serial_number', {
      type: Sequelize.STRING(100),
      allowNull: true,
      unique: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove check constraint
    await queryInterface.sequelize.query(`
      ALTER TABLE assets DROP CONSTRAINT IF EXISTS check_quantity_min
    `);

    // Revert quantity to allow 0
    await queryInterface.changeColumn('assets', 'quantity', {
      type: Sequelize.INTEGER,
      defaultValue: 1,
      allowNull: false
    });

    // Make serial_number required again
    await queryInterface.changeColumn('assets', 'serial_number', {
      type: Sequelize.STRING(100),
      allowNull: false,
      unique: true
    });
  }
};
