const cuponCtrl = require('../controllers/cupon.controller');
const express = require('express');
const router = express.Router();
const auditoriaMiddelware = require('../middelwares/auditoria.middlware');
const { verificarToken } = require('../middlewares/auth.middleware');

router.post('/', verificarToken, auditoriaMiddelware('Cupones'), cuponCtrl.crear);
/*
    #swagger.tags = ['Cupones']
    #swagger.summary = 'Crear un nuevo cupón (Admin)'
    #swagger.parameters[0] = {
        name: 'body',
        in: 'body',
        description: 'Datos del cupón',
        required: true,
        schema: {
            $codigo: 'FIESTAS2026',
            $porcentajeDescuento: 15.5,
            $fechaVencimiento: '2026-12-31',
            $usosMaximos: 100
        }
    }
*/

router.get('/', cuponCtrl.listar);
/*
    #swagger.tags = ['Cupones']
    #swagger.summary = 'Listar todos los cupones'
*/

router.get('/validar/:codigo', cuponCtrl.validar);
/*
    #swagger.tags = ['Cupones']
    #swagger.summary = 'Validar un cupón en el checkout'
    #swagger.description = 'Verifica si un código existe, si no está vencido y si tiene usos disponibles.'
    #swagger.parameters[0] = {
        name: 'codigo',
        in: 'path',
        description: 'Código del cupón (ej: FIESTAS2026)',
        required: true,
        type: 'string'
    }
    #swagger.responses[200] = { description: 'Cupón válido, retorna porcentaje' }
    #swagger.responses[400] = { description: 'Cupón inválido, vencido o agotado' }
*/
router.put('/:id', verificarToken, auditoriaMiddelware('Cupones'), cuponCtrl.editar);
/*
    #swagger.tags = ['Cupones']
    #swagger.summary = 'Editar un cupón (Admin)'
    #swagger.description = 'Permite modificar cualquier campo de un cupón (ej. cambiar su estado activo a false).'
    #swagger.parameters[0] = {
        name: 'id',
        in: 'path',
        description: 'ID del cupón a editar',
        required: true,
        type: 'integer'
    }
    #swagger.parameters[1] = {
        name: 'body',
        in: 'body',
        description: 'Datos a actualizar',
        required: true,
        schema: {
            $activo: false,
            $usosMaximos: 200
        }
    }
*/

router.delete('/:id', verificarToken, auditoriaMiddelware('Cupones'), cuponCtrl.eliminar);
/*
    #swagger.tags = ['Cupones']
    #swagger.summary = 'Eliminar un cupón (Admin)'
    #swagger.description = 'Elimina físicamente el cupón de la base de datos.'
    #swagger.parameters[0] = {
        name: 'id',
        in: 'path',
        description: 'ID del cupón a eliminar',
        required: true,
        type: 'integer'
    }
*/

module.exports = router;