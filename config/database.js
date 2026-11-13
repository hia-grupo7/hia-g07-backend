const { Sequelize } = require('sequelize');

const dbName = process.env.DB_NAME || 'postgres';
const dbUser = process.env.DB_USER || 'postgres';
const dbPass = process.env.DB_PASSWORD || 'admin123';
const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = process.env.DB_PORT || 5432;

const sequelize = new Sequelize(dbName, dbUser, dbPass, {
  host: dbHost,
  port: dbPort,
  dialect: 'postgres',
  logging: false,
});

sequelize.authenticate()
  .then(() => console.log('DB is connected to PostgreSQL'))
  .catch(err => console.error('Error al conectar a PostgreSQL:', err));

module.exports = sequelize;

