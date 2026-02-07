'use strict';

/**
 * Migration: Add deleted_by field to assets for soft delete audit trail
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add deleted_by_user_id to track who deleted the asset
    await queryInterface.addColumn('assets', 'deleted_by', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    // Add index on deleted_at for fast filtering of active vs deleted items
    await queryInterface.addIndex('assets', ['deleted_at'], {
      name: 'idx_assets_deleted_at',
      where: {
        deleted_at: { [Sequelize.Op.ne]: null }
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('assets', 'idx_assets_deleted_at');
    await queryInterface.removeColumn('assets', 'deleted_by');
  }
};
