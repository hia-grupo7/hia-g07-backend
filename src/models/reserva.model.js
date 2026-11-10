const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');
const Book = require('./book.model');
// Asumiendo que tus compañeros crearán un usuario.model.js, si no, luego agregamos la relación
// const Usuario = require('./usuario.model'); 

const Reserva = sequelize.define('Reserva', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    idUsuario: { type: DataTypes.INTEGER, allowNull: false },
    fechaReserva: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    fechaVencimiento: { type: DataTypes.DATE, allowNull: false },
    estado: { 
        type: DataTypes.STRING, 
        defaultValue: 'activa' // Puede ser: 'activa', 'completada', 'vencida', 'cancelada'
    }
}, {
    tableName: 'reservas',
    timestamps: true
});

// Relación con el Libro (Una reserva pertenece a un libro)
Reserva.belongsTo(Book, { foreignKey: 'idLibro', as: 'book' });
Book.hasMany(Reserva, { foreignKey: 'idLibro', as: 'reservas' });

module.exports = Reserva;