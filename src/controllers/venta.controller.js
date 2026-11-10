const ventaService = require('../services/venta.service');

const ventaController = {};

ventaController.procesarCompra = async (req, res) => {
    try {
        // Agregamos payer_email
        const { idUsuario, payer_email, itemsCarrito, idCupon } = req.body;

        if (!idUsuario || !payer_email || !itemsCarrito || itemsCarrito.length === 0) {
            return res.status(400).json({ error: 'Faltan datos obligatorios para procesar la compra' });
        }

        const resultado = await ventaService.crearVenta(idUsuario, payer_email, itemsCarrito, idCupon);
        
        res.status(201).json({
            mensaje: 'Compra iniciada con éxito',
            venta: resultado.ventaDB,
            reservas: resultado.reservasDB,
            link_mercado_pago: resultado.urlPago // <-- Angular usará este link
        });
    } catch (error) {
        console.error('Error al procesar la compra:', error.message);
        res.status(500).json({ error: 'Hubo un problema al procesar la venta', detalle: error.message });
    }
};

module.exports = ventaController;
