const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');
const Rol = require('./rol.model');

const Usuario = sequelize.define('Usuario', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  nombre: { 
    type: DataTypes.STRING, 
    allowNull: false 
  },
  apellido: { 
    type: DataTypes.STRING, 
    allowNull: false 
  },
  email: { 
    type: DataTypes.STRING, 
    allowNull: false, 
    unique: true,
    validate: { isEmail: true }
  },
  passwordHash: { 
    type: DataTypes.STRING, 
    allowNull: true 
  },
  estado: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  googleId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  otpCode: {
    type: DataTypes.STRING,
    allowNull: true
  },
  otpExpiresAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'usuarios',
  timestamps: true
});

// Establecer relación: 1 Rol tiene muchos Usuarios. 1 Usuario pertenece a 1 Rol.
Usuario.belongsTo(Rol, { foreignKey: 'rolId', as: 'Rol' });
Rol.hasMany(Usuario, { foreignKey: 'rolId' });

module.exports = Usuario;