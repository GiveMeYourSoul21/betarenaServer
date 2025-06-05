const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
  username: {
      type: DataTypes.STRING(20),
      allowNull: false,
    unique: true,
      validate: {
        len: [3, 20],
        notEmpty: true
      }
  },
  email: {
      type: DataTypes.STRING,
      allowNull: false,
    unique: true,
      validate: {
        isEmail: true,
        notEmpty: true
      },
      set(value) {
        this.setDataValue('email', value.toLowerCase().trim());
      }
  },
  password: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: [6, 255]
      }
  },
  chips: {
      type: DataTypes.INTEGER,
      defaultValue: 1000,
      validate: {
        min: 0
      }
  },
  lastBonus: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
      field: 'lastBonus'
  },
    statistics: {
      type: DataTypes.JSON,
      defaultValue: {
        gamesPlayed: 0,
        gamesWon: 0,
        totalEarnings: 0,
        highestWin: 0
      }
    }
  }, {
    tableName: 'users',
    timestamps: false,
    underscored: false,
    hooks: {
      beforeCreate: async (user) => {
        if (user.password) {
          const salt = await bcrypt.genSalt(10);
          user.password = await bcrypt.hash(user.password, salt);
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed('password')) {
    const salt = await bcrypt.genSalt(10);
          user.password = await bcrypt.hash(user.password, salt);
        }
      }
  }
});

// Метод для сравнения паролей
  User.prototype.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

  // Связи с другими моделями
  User.associate = function(models) {
    // User может иметь много игр
    User.hasMany(models.PokerGame, {
      foreignKey: 'userId',
      as: 'games'
    });
  };

  return User;
}; 