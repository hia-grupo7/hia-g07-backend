const { Sequelize } = require('sequelize');
const { leerSecreto } = require('./secrets');

const dbUser = process.env.DB_USER || 'postgres';
const dbPass = leerSecreto('DB_PASSWORD');
if (!dbPass) console.error('DB_PASSWORD no está configurada (ni como secreto ni como variable de entorno).');
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
  // Alta disponibilidad (CARD-08): durante un failover de Patroni (~30 s) no hay lider al que escribir y HAProxy cierra
  // las conexiones. En vez de devolver un error al usuario, los pedidos reintentan con espera creciente
  // (1 s, 1,5 s, 2,2 s... ~49 s en total, menos que el tiempo maximo de espera de nginx).
  retry: {
    max: 8,
    backoffBase: 1000,
    backoffExponent: 1.5,
    match: [
      /ConnectionError/, /ConnectionRefused/, /ConnectionTimedOut/, /ConnectionAcquireTimeout/,
      /ETIMEDOUT/, /ECONNRESET/, /ECONNREFUSED/, /EHOSTUNREACH/, /ENOTFOUND/,
      /Connection terminated/, /terminating connection/, /read-only transaction/
    ]
  },
  dialectOptions: {
    keepAlive: true,                   // detecta conexiones muertas tras la caida de un nodo
    connectionTimeoutMillis: 5000      // no esperar indefinidamente a un nodo caido
  },
  pool: {
    max: 20,       // Límite de conexiones para no saturar PostgreSQL (Connection Pooling)
    min: 0,
    acquire: 45000, // espera maxima por una conexion libre (cubre la ventana de un failover)
    idle: 10000,
    evict: 5000     // descarta conexiones inactivas para no reutilizar las del lider caido
  }
});

sequelize.authenticate()
  .then(() => console.log('✔ DB conectada con soporte de Read/Write Splitting y Pooling'))
  .catch(err => console.error('Error al conectar a PostgreSQL:', err));

module.exports = sequelize;