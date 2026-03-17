'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.createTable('inventory_write_offs', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true
        },
        write_off_number: {
          type: Sequelize.STRING(30),
          allowNull: false,
          unique: true
        },
        asset_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'assets', key: 'id' }
        },
        asset_unit_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'asset_units', key: 'id' }
        },
        reason: {
          type: Sequelize.ENUM('damaged', 'lost', 'obsolete', 'stolen', 'expired', 'other'),
          allowNull: false
        },
        reason_detail: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        quantity: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 1
        },
        unit_cost_amount: {
          type: Sequelize.DECIMAL(12, 2),
          allowNull: true
        },
        total_cost_amount: {
          type: Sequelize.DECIMAL(12, 2),
          allowNull: true
        },
        currency: {
          type: Sequelize.STRING(3),
          allowNull: false,
          defaultValue: 'GHS'
        },
        status: {
          type: Sequelize.ENUM('PENDING', 'APPROVED', 'REJECTED', 'REVERSED'),
          allowNull: false,
          defaultValue: 'PENDING'
        },
        approved_by: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'id' }
        },
        approved_at: {
          type: Sequelize.DATEONLY,
          allowNull: true
        },
        rejected_by: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'id' }
        },
        rejected_at: {
          type: Sequelize.DATEONLY,
          allowNull: true
        },
        rejection_reason: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        reversed_at: {
          type: Sequelize.DATEONLY,
          allowNull: true
        },
        reversed_by: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'id' }
        },
        reversal_reason: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        created_by: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' }
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
      }, { transaction });

      // Indexes
      await queryInterface.addIndex('inventory_write_offs', ['asset_id'], { transaction });
      await queryInterface.addIndex('inventory_write_offs', ['status'], { transaction });
      await queryInterface.addIndex('inventory_write_offs', ['created_at'], { transaction });
      await queryInterface.addIndex('inventory_write_offs', ['write_off_number'], { unique: true, transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('inventory_write_offs');

    // Clean up enums
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_inventory_write_offs_reason";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_inventory_write_offs_status";');
  }
};
