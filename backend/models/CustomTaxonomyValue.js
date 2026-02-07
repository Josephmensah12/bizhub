module.exports = (sequelize, DataTypes) => {
  const CustomTaxonomyValue = sequelize.define('CustomTaxonomyValue', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    value_type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        isIn: {
          args: [['category', 'asset_type']],
          msg: 'value_type must be category or asset_type'
        }
      }
    },
    value: {
      type: DataTypes.STRING(60),
      allowNull: false,
      validate: {
        len: {
          args: [1, 60],
          msg: 'value must be between 1 and 60 characters'
        }
      }
    },
    parent_category: {
      type: DataTypes.STRING(60),
      allowNull: true
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    }
  }, {
    tableName: 'custom_taxonomy_values',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  CustomTaxonomyValue.associate = (models) => {
    CustomTaxonomyValue.belongsTo(models.User, { as: 'creator', foreignKey: 'created_by' });
  };

  return CustomTaxonomyValue;
};
