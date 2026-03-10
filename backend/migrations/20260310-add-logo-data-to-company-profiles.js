'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('company_profiles', 'logo_data', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Base64-encoded logo image data for persistence across deploys'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('company_profiles', 'logo_data');
  }
};
