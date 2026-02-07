'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `UPDATE assets SET status = 'Processing' WHERE status = 'Reserved'`
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `UPDATE assets SET status = 'Reserved' WHERE status = 'Processing'`
    );
  }
};
