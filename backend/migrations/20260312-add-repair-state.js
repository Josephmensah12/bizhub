'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add repair_state fields to assets table
    await queryInterface.addColumn('assets', 'repair_state', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'regular'
    });
    await queryInterface.addColumn('assets', 'repair_notes', {
      type: Sequelize.TEXT,
      allowNull: true
    });
    await queryInterface.addColumn('assets', 'repair_updated_at', {
      type: Sequelize.DATE,
      allowNull: true
    });
    await queryInterface.addColumn('assets', 'repair_updated_by', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' }
    });
    await queryInterface.addColumn('assets', 'previous_condition_status_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'condition_statuses', key: 'id' }
    });

    // Add repair_state fields to asset_units table
    await queryInterface.addColumn('asset_units', 'repair_state', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'regular'
    });
    await queryInterface.addColumn('asset_units', 'repair_notes', {
      type: Sequelize.TEXT,
      allowNull: true
    });
    await queryInterface.addColumn('asset_units', 'repair_updated_at', {
      type: Sequelize.DATE,
      allowNull: true
    });
    await queryInterface.addColumn('asset_units', 'repair_updated_by', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' }
    });
    await queryInterface.addColumn('asset_units', 'previous_condition_status_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'condition_statuses', key: 'id' }
    });

    // Add index for filtering by repair_state
    await queryInterface.addIndex('assets', ['repair_state'], { name: 'idx_assets_repair_state' });
    await queryInterface.addIndex('asset_units', ['repair_state'], { name: 'idx_asset_units_repair_state' });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('asset_units', 'idx_asset_units_repair_state');
    await queryInterface.removeIndex('assets', 'idx_assets_repair_state');

    await queryInterface.removeColumn('asset_units', 'previous_condition_status_id');
    await queryInterface.removeColumn('asset_units', 'repair_updated_by');
    await queryInterface.removeColumn('asset_units', 'repair_updated_at');
    await queryInterface.removeColumn('asset_units', 'repair_notes');
    await queryInterface.removeColumn('asset_units', 'repair_state');

    await queryInterface.removeColumn('assets', 'previous_condition_status_id');
    await queryInterface.removeColumn('assets', 'repair_updated_by');
    await queryInterface.removeColumn('assets', 'repair_updated_at');
    await queryInterface.removeColumn('assets', 'repair_notes');
    await queryInterface.removeColumn('assets', 'repair_state');
  }
};
