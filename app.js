require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const sequelize = require('./config/database');

//librerias de swagger y archivo JSON que autogenera
const swaggerUi = require('swagger-ui-express');
const swaggerFile = require('./swagger_output.json');

const { collectDefaultMetrics, register } = require('prom-client');
const { limitadorLogin, limitadorVerificar2FA, limitadorChat } = require('./src/middlewares/rateLimit.middleware');

// Aplicacion Express sin arrancar el servidor ni sincronizar la base de datos.
// index.js se encarga de eso; separarlo permite probar las rutas en CI (supertest).
var app = express();
// Detras de nginx (y de Cloudflare Tunnel) la IP real llega en X-Forwarded-For. TRUST_PROXY_HOPS es la
// cantidad de proxies de confianza: 1 = solo nginx (por defecto); 2 = Cloudflare Tunnel + nginx.
// Sin esto el limitador vería a todos los clientes con la IP de nginx y compartirían un solo contador.
app.set('trust proxy', parseInt(process.env.TRUST_PROXY_HOPS, 10) || 1);
//middlewares
app.use(express.json());
app.use(cors({origin: 'http://localhost:4200'}));

// Servir imagenes de portadas
app.use('/covers', express.static(path.join(__dirname, 'public', 'covers')));

// entrar a http://localhost:3000/api/docs para ver toda la interfaz visual
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerFile));

// Endpoint de salud para Docker, Kubernetes y monitoreo
app.get('/api/health', async (req, res) => {
    try {
        await sequelize.authenticate();
        res.status(200).json({
            status: 'ok',
            servicio: 'rayuela-backend',
            baseDeDatos: 'conectada',
            uptimeSegundos: Math.floor(process.uptime()),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({
            status: 'error',
            servicio: 'rayuela-backend',
            baseDeDatos: 'desconectada',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Endpoint de métricas para Prometheus (prom-client) — OBS-02 / CARD-14
app.get('/api/metrics', async (req, res) => {
    res.setHeader('Content-Type', register.contentType);
    res.end(await register.metrics());
});

// Rate limiting (CARD-20 / SEC-01): va antes de las rutas para bloquear antes de llegar al controlador.
app.post('/api/auth/login', limitadorLogin);
app.post('/api/auth/verificar-2fa', limitadorVerificar2FA);
app.post('/api/chat', limitadorChat);

//Cargamos el modulo de direccionamiento de rutas
app.use('/api/inventario', require('./src/routes/inventory.route.js'));
app.use('/api/libros', require('./src/routes/book.route.js'));
app.use('/api/cupones', require('./src/routes/cupon.route.js'));
app.use('/api/auth', require('./src/routes/auth.route'));
app.use('/api/reservas', require('./src/routes/reserva.route.js'));
app.use('/api/ventas', require('./src/routes/venta.route.js'));
app.use('/api/dashboard', require('./src/routes/dashboard.routes.js'));
//app.use('/api/agente', require('./src/routes/agente.route.js'));
app.use('/api/admin/usuario', require('./src/routes/empleado.route'));
app.use('/api/auditorias', require('./src/routes/auditoria.route'));
app.use('/api/chat', require('./src/routes/chat.route.js'));

module.exports = app;
