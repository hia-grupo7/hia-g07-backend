const { where } = require('sequelize');
const empleadoService = require('../services/empleado.service');
const empleadoCtrl={};

empleadoCtrl.getEmpleados= async( req, res) =>{
    /* #swagger.tags = ['Usuarios/Empleados']
        #swagger.summary = 'Listar empleados activos'
        #swagger.description = 'Retorna una lista de usuarios cuyo rol es estrictamente empleado y están activos.'
        #swagger.responses[200] = {
            description: 'Lista de empleados obtenida con éxito.',
            schema: [{ $ref: '#/definitions/Usuario' }]
        }
    */
    try{
        const empleados = await empleadoService.getEmpleados();
        res.json(empleados);
    }catch(error){
        res.status(500).json({message: 'Error al obtener los empleados', error: error.message});
    };
}

empleadoCtrl.createEmpleado = async(req, res) =>{
    /* #swagger.tags = ['Usuarios/Empleados']
        #swagger.summary = 'Alta de un nuevo empleado'
        #swagger.description = 'Registra un nuevo empleado forzando el rol operativo en backend.'
        #swagger.consumes = ['application/json']
        #swagger.parameters['body'] = {
            in: 'body',
            description: 'Datos del empleado a registrar.',
            required: true,
            schema: { $ref: '#/definitions/Usuario' }
        }
        #swagger.responses[201] = { description: 'Empleado creado correctamente.' }
        #swagger.responses[400] = { description: 'Datos inválidos o email duplicado.' }
    */
    try{
        const { nombre, apellido, email, passwordHash } = req.body;

        if (!nombre || !apellido || !email || !passwordHash) {
            return res.status(400).json({ message: 'Campos obligatorios faltantes' });
        }

        const nuevoEmpleado = await empleadoService.createEmpleado(req.body);
        res.status(201).json({ message: 'Alta de personal exitosa', id: nuevoEmpleado.id });
    }catch(error){
        const status = error.message === 'El email ya está registrado' ? 400 : 500;
        res.status(status).json({ message: error.message });
    }
}

empleadoCtrl.updateEmpleado = async(req,res)=>{
    /* #swagger.tags = ['Usuarios/Empleados']
        #swagger.summary = 'Modificar perfil de empleado'
        #swagger.parameters['id'] = { description: 'ID del usuario' }
        #swagger.parameters['body'] = {
            in: 'body',
            required: true,
            schema: { nombre: 'Juan', apellido: 'Pérez', email: 'juan@correo.com' }
        }
        #swagger.responses[200] = { description: 'Perfil modificado con éxito.' }
        #swagger.responses[404] = { description: 'Empleado no encontrado.' }
    */
    try{
        await empleadoService.updateEmpleado(req.params.id, req.body);
        res.json({ message: 'Perfil modificado con éxito' });
    }catch(error){
        const status = error.message === 'Empleado no encontrado' ? 404 : 500;
        res.status(status).json({ message: error.message });
    }
}

empleadoCtrl.cambiarRol = async(req,res) => {
    /* #swagger.tags = ['Usuarios/Empleados']
        #swagger.summary = 'Cambiar rol de un usuario (Admin Only)'
        #swagger.parameters['body'] = {
            in: 'body',
            required: true,
            schema: { $ref: '#/definitions/CambioRol' }
        }
        #swagger.responses[200] = { description: 'Rol actualizado.' }
        #swagger.responses[400] = { description: 'Rol inválido.' }
    */
    try{
        await empleadoService.cambiarRol(req.params.id, req.body.nuevoRol);
        res.json({ message: 'Rol actualizado con éxito' });
    }catch(error){
        const status = 
                        error.message.includes('invalido') ? 400 :
                        error.message.includes('no encontrado') ? 404 : 500;
        res.status(status).json({ message: error.message });
    }
}

empleadoCtrl.deleteLogico = async(req,res) =>{
    /* #swagger.tags = ['Usuarios/Empleados']
        #swagger.summary = 'Desactivar empleado (Borrado Lógico)'
        #swagger.responses[200] = { description: 'Empleado dado de baja de forma lógica.' }
    */
    try{
        await empleadoService.deleteLogico(req.params.id);
        res.json({ message: 'Empleado dado de baja de forma lógica' });
    }catch(error){
        const status = error.message.includes('no encontrado') ? 404 : 500;
        res.status(status).json({ message: error.message });
    }
}

module.exports = empleadoCtrl;