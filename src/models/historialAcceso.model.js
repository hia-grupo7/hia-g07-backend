const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');
const Usuario = require('./usuario.model');

const HistorialAcceso = sequelize.define('HistorialAcceso', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  fecha: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  ip: {
    type: DataTypes.STRING,
    allowNull: false
  },
  dispositivo: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'historial_accesos',
  timestamps: false
});

HistorialAcceso.belongsTo(Usuario, { foreignKey: 'usuarioId', onDelete: 'CASCADE' });
Usuario.hasMany(HistorialAcceso, { foreignKey: 'usuarioId' });

module.exports = HistorialAcceso;