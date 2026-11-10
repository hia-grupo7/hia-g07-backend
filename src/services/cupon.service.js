const Cupon = require('../models/cupon.model');

const cuponService = {};

// Crear un nuevo cupón (Para el panel de Admin)
cuponService.crearCupon = async (datosCupon) => {
    try {
        const existe = await Cupon.findOne({ where: { codigo: datosCupon.codigo } });
        if (existe) throw new Error('El código de cupón ya existe');
        
        return await Cupon.create(datosCupon);
    } catch (error) {
        throw new Error(`Error al crear cupón: ${error.message}`);
    }
};

// Listar todos los cupones
cuponService.obtenerCupones = async () => {
    return await Cupon.findAll();
};

// Validar cupón (Para el Checkout del cliente)
cuponService.validarCupon = async (codigo) => {
    try {
        const cupon = await Cupon.findOne({ where: { codigo: codigo } });

        if (!cupon) {
            throw new Error('Cupón no encontrado');
        }
        if (!cupon.activo) {
            throw new Error('El cupón está desactivado');
        }
        if (cupon.usosActuales >= cupon.usosMaximos) {
            throw new Error('El cupón superó el límite de usos permitidos');
        }
        if (new Date(cupon.fechaVencimiento) < new Date()) {
            throw new Error('El cupón ya expiró');
        }

        // Si pasa todas las validaciones, devolvemos el cupón válido
        return cupon;
    } catch (error) {
        throw new Error(error.message);
    }
};
// Editar un cupón existente
cuponService.editarCupon = async (id, datosActualizados) => {
    try {
        const cupon = await Cupon.findByPk(id);
        if (!cupon) {
            throw new Error('Cupón no encontrado');
        }
        
        // Actualiza solo los campos que vengan en la petición
        await cupon.update(datosActualizados);
        return cupon;
    } catch (error) {
        throw new Error(`Error al editar cupón: ${error.message}`);
    }
};

// Eliminar un cupón
cuponService.eliminarCupon = async (id) => {
    try {
        const cupon = await Cupon.findByPk(id);
        if (!cupon) {
            throw new Error('Cupón no encontrado');
        }
        
        await cupon.destroy();
        return true;
    } catch (error) {
        throw new Error(`Error al eliminar cupón: ${error.message}`);
    }
};

module.exports = cuponService;