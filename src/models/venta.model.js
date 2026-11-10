const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Venta = sequelize.define('Venta', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    idUsuario: { type: DataTypes.INTEGER, allowNull: false }, 
    idCupon: { type: DataTypes.INTEGER, allowNull: true },
    total: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    estado: { type: DataTypes.STRING, defaultValue: 'pendiente' }
}, {
    tableName: 'ventas',
    timestamps: true, // Esto generará createdAt y updatedAt automáticamente
});

module.exports = Venta;