const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Cupon = sequelize.define('Cupon', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    codigo: { type: DataTypes.STRING, allowNull: false, unique: true },
    porcentajeDescuento: { type: DataTypes.FLOAT, allowNull: false },
    fechaVencimiento: { type: DataTypes.DATE, allowNull: false },
    usosMaximos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    usosActuales: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    activo: { type: DataTypes.BOOLEAN, defaultValue: true }
}, {
    tableName: 'cupones',
    timestamps: true
});

module.exports = Cupon;