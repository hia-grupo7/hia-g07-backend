const Rol = require('../src/models/rol.model'); // Asegurate de que la ruta a tu modelo sea correcta
const Usuario = require('../src/models/usuario.model');
const bcrypt = require('bcryptjs');

const seedRoles = async () => {
    try {
        // bulkCreate intenta meter todos estos registros juntos
        // 'ignoreDuplicates: true' hace que si el rol ya existe (por el UNIQUE en nombre), no haga nada y no tire error
        await Rol.bulkCreate([
            { nombre: 'admin', descripcion: 'Administrador con acceso total' },
            { nombre: 'empleado', descripcion: 'Personal operativo / Empleados' },
            { nombre: 'cliente', descripcion: 'Usuarios finales / Clientes' }
        ], { ignoreDuplicates: true });

        console.log('Roles por defecto verificados/creados en la base de datos.');

        const rolAdmin = await Rol.findOne({ where: { nombre: 'admin' } });
        const rolEmpleado = await Rol.findOne({ where: { nombre: 'empleado' } });

        if (!rolAdmin || !rolEmpleado) {
            throw new Error('No se pudieron recuperar los IDs de los roles para crear los usuarios semilla.');
        }

        const salt = await bcrypt.genSalt(10);
        const hashAdmin = await bcrypt.hash('admin123', salt);
        const hashEmpleado = await bcrypt.hash('empleado123', salt);

        // 3. Crear Usuario Administrador de prueba
        const [adminUser, adminCreated] = await Usuario.findOrCreate({
            where: { email: 'admin@sistema.com' },
            defaults: {
                nombre: 'Carlos',
                apellido: 'Admin',
                passwordHash: hashAdmin,
                estado: true,
                rolId: rolAdmin.id
            }
        });

        if (adminCreated) {
            console.log(`Usuario administrador semilla creado: ${adminUser.email}`);
        }

        // 4. Crear Usuario Empleado de prueba
        const [empleadoUser, empleadoCreated] = await Usuario.findOrCreate({
            where: { email: 'empleado@sistema.com' },
            defaults: {
                nombre: 'Laura',
                apellido: 'Operativa',
                passwordHash: hashEmpleado,
                estado: true,
                rolId: rolEmpleado.id
            }
        });

        if (empleadoCreated) {
            console.log(`Usuario empleado semilla creado: ${empleadoUser.email}`);
        }

    } catch (error) {
        console.error('Error de cupones', error.message);
    }
};

module.exports = seedRoles;