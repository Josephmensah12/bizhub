module.exports = (sequelize, DataTypes) => {
  const DescriptionMapping = sequelize.define('DescriptionMapping', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true
    },
    asset_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'assets',
        key: 'id'
      }
    },
    match_type: {
      type: DataTypes.ENUM('exact', 'fuzzy', 'manual'),
      allowNull: false,
      defaultValue: 'manual'
    },
    confidence: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
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
    tableName: 'description_asset_mappings',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  DescriptionMapping.associate = (models) => {
    DescriptionMapping.belongsTo(models.Asset, { foreignKey: 'asset_id' });
    DescriptionMapping.belongsTo(models.User, { as: 'creator', foreignKey: 'created_by' });
  };

  return DescriptionMapping;
};
