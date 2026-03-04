'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Create stock_take_batches table
    await queryInterface.createTable('stock_take_batches', {
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
      batch_number: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('active', 'closed'),
        allowNull: false,
        defaultValue: 'active'
      },
      target_size: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 20
      },
      scanned_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()')
      },
      closed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
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

    // Only one ACTIVE batch per session
    await queryInterface.addIndex('stock_take_batches', ['stock_take_id', 'status'], {
      unique: true,
      where: { status: 'active' },
      name: 'stock_take_batches_one_active_per_session'
    });

    // Fast lookup by session + batch number
    await queryInterface.addIndex('stock_take_batches', ['stock_take_id', 'batch_number'], {
      unique: true,
      name: 'stock_take_batches_session_number'
    });

    // 2. Add batch_id column to stock_take_scans
    await queryInterface.addColumn('stock_take_scans', 'stock_take_batch_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'stock_take_batches', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.addIndex('stock_take_scans', ['stock_take_batch_id'], {
      name: 'stock_take_scans_batch'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('stock_take_scans', 'stock_take_batch_id');
    await queryInterface.dropTable('stock_take_batches');
  }
};
