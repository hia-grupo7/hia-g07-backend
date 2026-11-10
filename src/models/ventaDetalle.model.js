const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');
const Venta = require('./venta.model');
const Book = require('./book.model');

const VentaDetalle = sequelize.define('VentaDetalle', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    cantidad: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    precioUnitario: { type: DataTypes.FLOAT, allowNull: false }
}, {
    tableName: 'venta_detalles',
    timestamps: false
});

// Relaciones
VentaDetalle.belongsTo(Venta, { foreignKey: 'idVenta', as: 'venta' });
VentaDetalle.belongsTo(Book, { foreignKey: 'idLibro', as: 'book' });
Venta.hasMany(VentaDetalle, { foreignKey: 'idVenta', as: 'detalles' });

module.exports = VentaDetalle;