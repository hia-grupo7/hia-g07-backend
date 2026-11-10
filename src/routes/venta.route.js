const ventaCtrl = require('../controllers/venta.controller');
const express = require('express');
const router = express.Router();

router.post('/checkout', ventaCtrl.procesarCompra);
/*
    #swagger.tags = ['Ventas']
    #swagger.summary = 'Procesar una compra'
    #swagger.description = 'Crea una nueva venta, guarda los detalles de los libros comprados y descuenta el stock.'
    #swagger.parameters[0] = {
        name: 'body',
        in: 'body',
        description: 'Datos de la compra (usuario y carrito)',
        required: true,
        schema: {
            $idUsuario: 1,
            $idCupon: null,
            $itemsCarrito: [
                {
                    $idLibro: 1,
                    $cantidad: 2,
                    $precioUnitario: 1500.50
                },
                {
                    $idLibro: 3,
                    $cantidad: 1,
                    $precioUnitario: 3200.00
                }
            ]
        }
    }
    #swagger.responses[201] = {
        description: 'Compra procesada con éxito'
    }
    #swagger.responses[400] = {
        description: 'Petición inválida (Faltan datos)'
    }
    #swagger.responses[500] = {
        description: 'Error interno del servidor o Stock insuficiente'
    }
*/

module.exports = router;