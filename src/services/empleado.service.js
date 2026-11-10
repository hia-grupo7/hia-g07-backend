const Usuario = require('../models/usuario.model');
const Rol = require('../models/rol.model');
const bcrypt = require('bcryptjs');


const empleadoService={};

empleadoService.getEmpleados= async() =>{
    return await Usuario.findAll({
        where: { estado: true },
        include: [{
            model: Rol,
            as: 'Rol',
            where: { nombre: 'empleado' },
            attributes: [],
            required: true
        }],
        attributes: {exclude: ['usuarioId','createdAt','updatedAt','passwordHash']}
    }); 
}

empleadoService.createEmpleado = async(datos) =>{

    const { nombre, apellido, email, passwordHash } = datos;
    const emailExistente = await Usuario.findOne({ where: { email } });

    if (emailExistente) {
        throw new Error('El email ya está registrado');
    }

    const rolEmpleado = await Rol.findOne({ where: { nombre: 'empleado' } });
    if (!rolEmpleado) {
        throw new Error('No existe el rol empleado');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHasheado = await bcrypt.hash(passwordHash, salt);
    
    return await Usuario.create({
        nombre, apellido, email, passwordHash: passwordHasheado,
        rolId: rolEmpleado.id,
        estado: true
    });
}

//preguntar ia
empleadoService.updateEmpleado = async(id, datos) =>{

    const { nombre, apellido, email } = datos;
    const empleado = await Usuario.findOne({
        where: { id },
        include: [{
            model: Rol,
            as: 'Rol',
            where: { nombre: 'empleado' },
            required: true
        }]
    });

    if (!empleado) {
        throw new Error('Empleado no encontrado');
    }
    await Usuario.update({ nombre, apellido, email }, { where: { id } });
    return empleado;

}

empleadoService.cambiarRol = async(id, nuevoRol) =>{

    const rolPermitido = ['empleado', 'administrador', 'cliente'];
    if(!rolPermitido.includes(nuevoRol)){
        throw new Error('Rol inválido');
    }

    const usuario = await Usuario.findByPk(id);
    if (!usuario) {
        throw new Error('Usuario no encontrado');
    }

    const rol = await Rol.findOne({ where: { nombre: nuevoRol } });
    if (!rol) {
        throw new Error('Rol inválido');
    }

    await usuario.update({ rolId: rol.id });
    return usuario;

}

empleadoService.deleteLogico = async(id) =>{
    const empleado = await Usuario.findOne({
        where: { id },
        include: [{
            model: Rol,
            as: 'Rol',
            where: { nombre: 'empleado' },
            required: true
        }]
    });

    if (!empleado) {
        throw new Error('Empleado no encontrado');
    }

    await empleado.update({ estado: false });
    return empleado;
}

module.exports = empleadoService;
