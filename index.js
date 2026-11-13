require('dotenv').config();
const sequelize = require('./config/database');
const seedRoles = require('./config/initRoles.js');

const Rol = require('./src/models/rol.model');

// La aplicacion Express (middlewares y rutas) vive en app.js para poder probarla sin BD.
const app = require('./app');

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
