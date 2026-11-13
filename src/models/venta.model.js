const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');
const Usuario = require('./usuario.model');
const Cupon = require('./cupon.model');

const Venta = sequelize.define('Venta', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    idUsuario: { 
        type: DataTypes.INTEGER, 
        allowNull: false,
        references: {
            model: 'usuarios',
            key: 'id'
        }
    }, 
    idCupon: { 
        type: DataTypes.INTEGER, 
        allowNull: true,
        references: {
            model: 'cupones',
            key: 'id'
        }
    },
    total: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    estado: { type: DataTypes.STRING, defaultValue: 'pendiente' }
}, {
    tableName: 'ventas',
    timestamps: true
});

// Relación con Usuario (Una venta pertenece a un usuario)
Venta.belongsTo(Usuario, { foreignKey: 'idUsuario', as: 'usuario' });
Usuario.hasMany(Venta, { foreignKey: 'idUsuario', as: 'ventas' });

// Relación con Cupón (Una venta puede tener un cupón aplicado)
Venta.belongsTo(Cupon, { foreignKey: 'idCupon', as: 'cupon' });
Cupon.hasMany(Venta, { foreignKey: 'idCupon', as: 'ventas' });

module.exports = Venta;