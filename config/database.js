const { Sequelize } = require('sequelize');

const dbUser = process.env.DB_USER || 'postgres';
const dbPass = process.env.DB_PASSWORD || 'admin123';
const dbName = process.env.DB_NAME || 'postgres';

// Configuración de Read/Write Splitting para Alta Disponibilidad
const sequelize = new Sequelize(dbName, dbUser, dbPass, {
  dialect: 'postgres',
  logging: false,
  replication: {
    // Nodo de Escritura (Primario)
    write: {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      username: dbUser,
      password: dbPass
    },
    // Nodos de Lectura (Réplicas Standby)
    read: [
      {
        host: process.env.DB_READ_HOST || process.env.DB_HOST || 'localhost',
        port: process.env.DB_READ_PORT || process.env.DB_PORT || 5432, // En clúster distribuido apunta al puerto de la réplica
        username: dbUser,
        password: dbPass
      }
    ]
  },
  pool: {
    max: 20,       // Límite de conexiones para no saturar PostgreSQL (Connection Pooling)
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

sequelize.authenticate()
  .then(() => console.log('✔ DB conectada con soporte de Read/Write Splitting y Pooling'))
  .catch(err => console.error('Error al conectar a PostgreSQL:', err));

module.exports = sequelize;