'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('assets', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      asset_tag: {
        type: Sequelize.STRING(20),
        allowNull: false,
        unique: true
      },
      asset_type: {
        type: Sequelize.STRING(20),
        allowNull: false
      },
      serial_number: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true
      },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'In Stock'
      },
      condition: {
        type: Sequelize.STRING(20),
        allowNull: true
      },
      quantity: {
        type: Sequelize.INTEGER,
        defaultValue: 1,
        allowNull: false
      },
      make: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      model: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      category: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      subcategory: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      specs: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      ram_gb: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      storage_gb: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      storage_type: {
        type: Sequelize.STRING(20),
        allowNull: true
      },
      cpu: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      gpu: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      screen_size_inches: {
        type: Sequelize.DECIMAL(4, 2),
        allowNull: true
      },
      resolution: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      battery_health_percent: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      major_characteristics: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: []
      },
      cost: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      currency: {
        type: Sequelize.STRING(3),
        defaultValue: 'GHS',
        allowNull: false
      },
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      updated_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
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

    // Add indexes
    await queryInterface.addIndex('assets', ['asset_tag'], { unique: true });
    await queryInterface.addIndex('assets', ['serial_number'], { unique: true });
    await queryInterface.addIndex('assets', ['asset_type']);
    await queryInterface.addIndex('assets', ['status']);
    await queryInterface.addIndex('assets', ['make']);
    await queryInterface.addIndex('assets', ['condition']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('assets');
  }
};
