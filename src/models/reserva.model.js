const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');
const Book = require('./book.model');
const Usuario = require('./usuario.model');

const Reserva = sequelize.define('Reserva', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    idUsuario: { 
        type: DataTypes.INTEGER, 
        allowNull: false,
        references: {
            model: 'usuarios',
            key: 'id'
        },
        onDelete: 'CASCADE'
    },
    fechaReserva: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    fechaVencimiento: { type: DataTypes.DATE, allowNull: false },
    estado: { 
        type: DataTypes.STRING, 
        defaultValue: 'activa' // 'activa', 'completada', 'vencida', 'cancelada'
    }
}, {
    tableName: 'reservas',
    timestamps: true
});

// Relación con Libro
Reserva.belongsTo(Book, { foreignKey: 'idLibro', as: 'book' });
Book.hasMany(Reserva, { foreignKey: 'idLibro', as: 'reservas' });

// Relación con Usuario (Foreign Key)
Reserva.belongsTo(Usuario, { foreignKey: 'idUsuario', as: 'usuario' });
Usuario.hasMany(Reserva, { foreignKey: 'idUsuario', as: 'reservas' });

module.exports = Reserva;