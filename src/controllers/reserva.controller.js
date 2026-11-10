const reservaService = require('../services/reserva.service');

const reservaController = {};

reservaController.crearReserva = async (req, res) => {
    try {
        const { idUsuario, idLibro } = req.body;

        if (!idUsuario || !idLibro) {
            return res.status(400).json({ error: 'Faltan datos obligatorios: idUsuario o idLibro' });
        }

        const nuevaReserva = await reservaService.crearReserva(idUsuario, idLibro);
        
        res.status(201).json({
            mensaje: 'Reserva procesada con éxito',
            reserva: nuevaReserva
        });
    } catch (error) {
        console.error('Error al procesar la reserva:', error.message);
        // Si el error es por falta de stock, mandamos un 409 Conflict o 400. Usaremos 400 para simplificar.
        res.status(400).json({ error: 'No se pudo completar la reserva', detalle: error.message });
    }
};
// ---> AGREGA ESTO ANTES DEL module.exports <---

reservaController.obtenerPorUsuario = async (req, res) => {
    try {
        const { idUsuario } = req.params;
        const reservas = await reservaService.obtenerReservasPorUsuario(idUsuario);
        res.status(200).json(reservas);
    } catch (error) {
        console.error('Error al obtener reservas:', error.message);
        res.status(500).json({ error: 'Hubo un problema al consultar las reservas' });
    }
};

reservaController.cancelar = async (req, res) => {
    try {
        const { id } = req.params; // ID de la reserva
        const reservaCancelada = await reservaService.cancelarReserva(id);
        
        res.status(200).json({
            mensaje: 'Reserva cancelada y stock liberado con éxito',
            reserva: reservaCancelada
        });
    } catch (error) {
        console.error('Error al cancelar reserva:', error.message);
        res.status(400).json({ error: error.message });
    }
};

module.exports = reservaController;