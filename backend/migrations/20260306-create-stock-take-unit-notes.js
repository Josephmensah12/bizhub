'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('stock_take_unit_notes', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      stock_take_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'stock_takes', key: 'id' },
        onDelete: 'CASCADE'
      },
      stock_take_item_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'stock_take_items', key: 'id' },
        onDelete: 'CASCADE'
      },
      asset_unit_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'asset_units', key: 'id' },
        onDelete: 'CASCADE'
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()')
      }
    });

    await queryInterface.addIndex('stock_take_unit_notes',
      ['stock_take_id', 'asset_unit_id'],
      { unique: true, name: 'stock_take_unit_notes_st_unit_unique' }
    );

    await queryInterface.addIndex('stock_take_unit_notes',
      ['stock_take_item_id'],
      { name: 'stock_take_unit_notes_item' }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('stock_take_unit_notes');
  }
};
