const { DataTypes } = require('sequelize');
const sequelize = require('./../../config/database');

const Auditoria = sequelize.define('Auditoria', {
    accion: {type: DataTypes.STRING, allowNull: false },
    tablaAfectada: {type: DataTypes.STRING, allowNull: false},
    registroId: {type: DataTypes.INTEGER, allowNull: true},
    usuarioId: {type: DataTypes.INTEGER, allowNull: true},
    detalle: {type: DataTypes.TEXT, allowNull: false},
    fecha: {type: DataTypes.DATE, allowNull: false}
}, {
    tableName: 'auditorias', 
    timestamps: true,
}); 

module.exports = Auditoria;

const Usuario = require('./usuario.model');
Auditoria.belongsTo(Usuario, {foreignKey: 'usuarioId', as: 'usuario'})
