'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const [cols] = await queryInterface.sequelize.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'max_discount_percent'"
    );
    if (cols.length === 0) {
      await queryInterface.addColumn('users', 'max_discount_percent', {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true,
        defaultValue: null,
        comment: 'Max discount percent allowed. NULL = unlimited (Admin). Default 15 for Sales, 35 for Manager.'
      });

      // Set defaults for existing users based on role
      await queryInterface.sequelize.query(
        "UPDATE users SET max_discount_percent = 15.00 WHERE role = 'Sales' AND max_discount_percent IS NULL"
      );
      await queryInterface.sequelize.query(
        "UPDATE users SET max_discount_percent = 35.00 WHERE role = 'Manager' AND max_discount_percent IS NULL"
      );
    }
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('users', 'max_discount_percent').catch(() => {});
  }
};
