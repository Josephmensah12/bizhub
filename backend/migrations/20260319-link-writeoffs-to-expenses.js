'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add write_off_id column to expenses for linking (skip if already exists from sync)
    const tableDesc = await queryInterface.describeTable('expenses');
    if (!tableDesc.write_off_id) {
      await queryInterface.addColumn('expenses', 'write_off_id', {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'inventory_write_offs', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }

    // Add index if not exists
    try {
      await queryInterface.addIndex('expenses', ['write_off_id'], {
        name: 'idx_expenses_write_off_id'
      });
    } catch (e) {
      // Index may already exist
    }

    // Add 'write_off' to source_type enum (IF NOT EXISTS is idempotent)
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_expenses_source_type" ADD VALUE IF NOT EXISTS 'write_off';
    `);

    // Seed "Inventory Write-Offs" category if it doesn't exist
    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM expense_categories WHERE name = 'Inventory Write-Offs'`
    );
    if (existing.length === 0) {
      await queryInterface.bulkInsert('expense_categories', [{
        name: 'Inventory Write-Offs',
        is_sensitive: false,
        is_active: true,
        sort_order: 13,
        created_at: new Date(),
        updated_at: new Date()
      }]);
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('expenses', 'write_off_id');
    // Note: cannot remove enum value in PostgreSQL without recreating the type
  }
};
