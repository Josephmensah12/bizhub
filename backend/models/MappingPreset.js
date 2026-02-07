const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class MappingPreset extends Model {
    static associate(models) {
      MappingPreset.belongsTo(models.User, {
        foreignKey: 'user_id',
        as: 'owner'
      });
    }
  }

  MappingPreset.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    preset_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 255]
      }
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    file_type: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'CSV, Excel, etc.'
    },
    mapping_config: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      comment: 'Column mappings: { bizHubField: sourceColumn }'
    },
    constant_values: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      comment: 'Constant values: { bizHubField: constantValue }'
    },
    transform_rules: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Any custom transformation settings'
    }
  }, {
    sequelize,
    modelName: 'MappingPreset',
    tableName: 'import_mapping_presets',
    underscored: true,
    timestamps: true
  });

  return MappingPreset;
};
