const cuponService = require('../services/cupon.service');

const cuponController = {};

cuponController.crear = async (req, res) => {
    try {
        const nuevoCupon = await cuponService.crearCupon(req.body);
        res.status(201).json({ mensaje: 'Cupón creado', cupon: nuevoCupon });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

cuponController.listar = async (req, res) => {
    try {
        const cupones = await cuponService.obtenerCupones();
        res.status(200).json(cupones);
    } catch (error) {
        res.status(500).json({ error: 'Error al listar cupones' });
    }
};

cuponController.validar = async (req, res) => {
    try {
        const { codigo } = req.params;
        const cuponValido = await cuponService.validarCupon(codigo);
        res.status(200).json({
            mensaje: 'Cupón válido',
            descuento: cuponValido.porcentajeDescuento,
            idCupon: cuponValido.id
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};
cuponController.editar = async (req, res) => {
    try {
        const { id } = req.params;
        const cuponEditado = await cuponService.editarCupon(id, req.body);
        res.status(200).json({
            mensaje: 'Cupón actualizado con éxito',
            cupon: cuponEditado
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

cuponController.eliminar = async (req, res) => {
    try {
        const { id } = req.params;
        await cuponService.eliminarCupon(id);
        res.status(200).json({ mensaje: 'Cupón eliminado permanentemente' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

module.exports = cuponController;