'use strict';

/**
 * Migration: Create Activity Log Table
 *
 * Tracks important activities like payments, refunds, voids, cancellations
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('activity_logs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      actor_user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      action_type: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      entity_type: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      entity_id: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      summary: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });

    // Add indexes for common queries
    await queryInterface.addIndex('activity_logs', ['entity_type', 'entity_id'], {
      name: 'idx_activity_logs_entity'
    });

    await queryInterface.addIndex('activity_logs', ['actor_user_id'], {
      name: 'idx_activity_logs_actor'
    });

    await queryInterface.addIndex('activity_logs', ['action_type'], {
      name: 'idx_activity_logs_action'
    });

    await queryInterface.addIndex('activity_logs', ['created_at'], {
      name: 'idx_activity_logs_created'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('activity_logs');
  }
};
