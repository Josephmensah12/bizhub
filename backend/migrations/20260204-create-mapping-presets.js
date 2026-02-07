'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('import_mapping_presets', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      preset_name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      file_type: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'CSV, Excel, etc.'
      },
      mapping_config: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
        comment: 'Column mappings: { bizHubField: sourceColumn }'
      },
      constant_values: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
        comment: 'Constant values: { bizHubField: constantValue }'
      },
      transform_rules: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Any custom transformation settings'
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Add index for faster lookups
    await queryInterface.addIndex('import_mapping_presets', ['user_id']);
    await queryInterface.addIndex('import_mapping_presets', ['preset_name', 'user_id'], {
      name: 'idx_preset_name_user'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('import_mapping_presets');
  }
};
