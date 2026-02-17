module.exports = (sequelize, DataTypes) => {
  const NotificationLog = sequelize.define('NotificationLog', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    preorder_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    channel: {
      type: DataTypes.ENUM('email', 'sms', 'whatsapp'),
      allowNull: false,
      defaultValue: 'email'
    },
    recipient: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    subject: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('sent', 'failed', 'pending'),
      allowNull: false,
      defaultValue: 'pending'
    },
    provider_id: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'notification_logs',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['preorder_id'] }
    ]
  });

  NotificationLog.associate = (models) => {
    NotificationLog.belongsTo(models.Preorder, {
      foreignKey: 'preorder_id',
      as: 'preorder'
    });
  };

  return NotificationLog;
};
