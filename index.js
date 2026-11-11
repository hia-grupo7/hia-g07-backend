require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const sequelize = require('./config/database');
const seedRoles = require('./config/initRoles.js');

const dotenv = require('dotenv');
const Rol = require('./src/models/rol.model');

dotenv.config();

//librerias de swagger y archivo JSON que autogenera
const swaggerUi = require('swagger-ui-express');
const swaggerFile = require('./swagger_output.json');

var app = express();
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

const asegurarRolesBase = async () => {
    const rolesBase = [
        { nombre: 'cliente', descripcion: 'Cliente del sistema' },
        { nombre: 'empleado', descripcion: 'Empleado del sistema' },
        { nombre: 'administrador', descripcion: 'Administrador del sistema' }
    ];

    for (const rol of rolesBase) {
        await Rol.findOrCreate({ where: { nombre: rol.nombre }, defaults: rol });
    }
};

//setting
app.set('port', process.env.PORT || 3000);
// Sincronizar Base de Datos y arrancar el servidor
// alter: true permite agregar columnas nuevas en tablas existentes sin borrar datos.
sequelize.sync({ force: false, alter: true })
.then(async () => {
    await seedRoles();
    console.log('Tablas de PostgreSQL sincronizadas');
    app.listen(app.get('port'), () => {
    console.log(`Server started on port`, app.get('port'));
});
})
.catch(err => {
    console.error('No se pudo iniciar el servidor debido a un error en la BD:', err);
});
