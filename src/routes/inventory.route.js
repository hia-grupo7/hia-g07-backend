const inventoryCtrl = require('../controllers/inventory.controller');
const express = require('express');
const router = express.Router();
const auditoriaMiddelware = require('../middelwares/auditoria.middlware');
const { verificarToken } = require('../middlewares/auth.middleware');

router.get('/', inventoryCtrl.getInventory);
/*
    #swagger.tags = ['Inventario']
    #swagger.summary = 'Obtener inventario'
    #swagger.description = 'Retorna una lista con todos los productos disponibles en el inventario.'
    #swagger.responses[200] = {

*/

router.post('/generate', verificarToken, auditoriaMiddelware('Inventario'), inventoryCtrl.generateInventoryForAllBooks);
/*
    #swagger.tags = ['Inventario']
    #swagger.summary = 'Generar inventarios para todos los libros'
    #swagger.description = 'Crea un inventario automáticamente para cada libro existente en la base de datos.'
    #swagger.responses[200] = {
        description: 'Inventarios generados correctamente'
    }
*/

router.post('/', verificarToken, auditoriaMiddelware('Inventario'), inventoryCtrl.createInventory);
/*
    #swagger.tags = ['Inventario']
    #swagger.summary = 'Crear un nuevo producto en el inventario'
    #swagger.description = 'Crea un nuevo producto en el inventario.'
    #swagger.parameters[0] = {
        name: 'producto',
        in: 'body',
        description: 'Datos del producto a crear',
        required: true,
        schema: {
            $ref: '#/definitions/Producto'
        }
    }
    #swagger.responses[201] = {
        description: 'Producto creado correctamente',
        schema: {
            $ref: '#/definitions/Producto'
        }
    }
};
*/

router.put('/:id', verificarToken, auditoriaMiddelware('Inventario'), inventoryCtrl.updateInventory);
/*
    #swagger.tags = ['Inventario']
    #swagger.summary = 'Actualizar un producto en el inventario'
    #swagger.description = 'Actualiza la información de un producto existente en el inventario.'
    #swagger.parameters[0] = {
        name: 'id',
        in: 'path',
        description: 'ID del producto a actualizar',
        required: true,
        type: 'string'
    }
    #swagger.parameters[1] = {
        name: 'producto',
        in: 'body',
        description: 'Nuevos datos del producto',
        required: true,
        schema: {
            $ref: '#/definitions/Producto'
        }
    }
    #swagger.responses[200] = {
        description: 'Producto actualizado correctamente',
        schema: {
            $ref: '#/definitions/Producto'
        }
    }
};
*/

router.delete('/:id', verificarToken, auditoriaMiddelware('Inventario'), inventoryCtrl.deleteInventory);
/*
    #swagger.tags = ['Inventario']
    #swagger.summary = 'Eliminar un producto del inventario'
    #swagger.description = 'Elimina un producto existente del inventario.'
    #swagger.parameters[0] = {
        name: 'id',
        in: 'path',
        description: 'ID del producto a eliminar',
        required: true,
        type: 'string'
    }
    #swagger.responses[200] = {
        description: 'Producto eliminado correctamente'
    }
};
*/

router.get('/:id', inventoryCtrl.getInventoryById);
/*
    #swagger.tags = ['Inventario']
    #swagger.summary = 'Obtener un producto del inventario por ID'
    #swagger.description = 'Retorna la información de un producto específico en el inventario.'
    #swagger.parameters[0] = {
        name: 'id',
        in: 'path',
        description: 'ID del producto a obtener',
        required: true,
        type: 'string'
    }
    #swagger.responses[200] = {
        description: 'Producto obtenido correctamente',
        schema: {
            $ref: '#/definitions/Producto'
        }
    }
};
*/

module.exports = router;