module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('invoice_adjustments', {
      id: { allowNull: false, primaryKey: true, type: Sequelize.UUID, defaultValue: Sequelize.literal('gen_random_uuid()') },
      invoice_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'invoices', key: 'id' } },
      adjusted_by_user_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
      reason: { type: Sequelize.TEXT, allowNull: false },
      field_name: { type: Sequelize.STRING(50), allowNull: false, comment: 'e.g. unit_price, discount, customer, item_added, item_removed' },
      item_id: { type: Sequelize.UUID, comment: 'invoice_item_id if line-level change' },
      old_value: { type: Sequelize.TEXT },
      new_value: { type: Sequelize.TEXT },
      old_total: { type: Sequelize.DECIMAL(12, 2) },
      new_total: { type: Sequelize.DECIMAL(12, 2) },
      created_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') }
    });

    await queryInterface.addIndex('invoice_adjustments', ['invoice_id']);

    // Add adjustment tracking columns to invoices
    await queryInterface.addColumn('invoices', 'is_adjusted', {
      type: Sequelize.BOOLEAN, defaultValue: false
    });
    await queryInterface.addColumn('invoices', 'last_adjusted_at', {
      type: Sequelize.DATE
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('invoices', 'last_adjusted_at');
    await queryInterface.removeColumn('invoices', 'is_adjusted');
    await queryInterface.dropTable('invoice_adjustments');
  }
};
