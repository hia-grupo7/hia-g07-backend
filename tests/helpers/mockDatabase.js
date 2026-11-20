// Reemplazo de config/database.js para las pruebas: una instancia real de Sequelize
// (los modelos se definen igual) que nunca abre una conexion a PostgreSQL.
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize('test', 'test', 'test', {
  host: 'localhost',
  dialect: 'postgres',
  logging: false,
});

// Cada prueba decide si la base "responde" o "falla".
sequelize.authenticate = jest.fn();

module.exports = sequelize;
