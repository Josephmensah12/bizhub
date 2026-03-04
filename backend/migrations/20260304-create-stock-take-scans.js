'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('stock_take_scans', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      stock_take_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'stock_takes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      stock_take_item_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'stock_take_items', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      asset_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'assets', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      asset_unit_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'asset_units', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      serial_number: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      scanned_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      scanned_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()')
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('NOW()')
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('NOW()')
      }
    });

    // Prevent duplicate serial scans within a session
    await queryInterface.addIndex('stock_take_scans', ['stock_take_id', 'serial_number'], {
      unique: true,
      name: 'stock_take_scans_session_serial_unique'
    });

    // Fast lookup by session + item (for grouping scans by product)
    await queryInterface.addIndex('stock_take_scans', ['stock_take_id', 'stock_take_item_id'], {
      name: 'stock_take_scans_session_item'
    });

    // Fast serial lookup
    await queryInterface.addIndex('stock_take_scans', ['serial_number'], {
      name: 'stock_take_scans_serial'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('stock_take_scans');
  }
};
