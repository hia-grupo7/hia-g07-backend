const reservaCtrl = require('../controllers/reserva.controller');
const express = require('express');
const router = express.Router();

router.post('/', reservaCtrl.crearReserva);
/*
    #swagger.tags = ['Reservas']
    #swagger.summary = 'Crear una reserva de un libro'
    #swagger.description = 'Crea una nueva reserva, descuenta 1 unidad del stock y la suma al campo reserved del inventario. Vence a las 48 horas.'
    #swagger.parameters[0] = {
        name: 'body',
        in: 'body',
        description: 'Datos de la reserva',
        required: true,
        schema: {
            $idUsuario: 1,
            $idLibro: 2
        }
    }
    #swagger.responses[201] = {
        description: 'Reserva procesada con éxito'
    }
    #swagger.responses[400] = {
        description: 'Petición inválida o sin stock disponible'
    }
*/
router.get('/usuario/:idUsuario', reservaCtrl.obtenerPorUsuario);
/*
    #swagger.tags = ['Reservas']
    #swagger.summary = 'Listar reservas de un usuario'
    #swagger.description = 'Devuelve un array con todas las reservas realizadas por un usuario específico.'
    #swagger.parameters[0] = {
        name: 'idUsuario',
        in: 'path',
        description: 'ID del Usuario',
        required: true,
        type: 'integer'
    }
    #swagger.responses[200] = { description: 'Lista de reservas' }
*/

router.put('/:id/cancelar', reservaCtrl.cancelar);
/*
    #swagger.tags = ['Reservas']
    #swagger.summary = 'Cancelar una reserva'
    #swagger.description = 'Cambia el estado de la reserva a cancelada y devuelve el stock al inventario (suma stock, resta reserved).'
    #swagger.parameters[0] = {
        name: 'id',
        in: 'path',
        description: 'ID de la Reserva',
        required: true,
        type: 'integer'
    }
    #swagger.responses[200] = { description: 'Reserva cancelada con éxito' }
    #swagger.responses[400] = { description: 'Reserva no encontrada o ya cancelada' }
*/
module.exports = router;