const bookCtrl = require('../controllers/book.controller');
const express = require('express');
const router = express.Router();
const auditoriaMiddelware = require('../middelwares/auditoria.middlware');
const { verificarToken } = require('../middlewares/auth.middleware');

router.post('/generate', verificarToken, auditoriaMiddelware('Libros'), bookCtrl.fillInitialCatalog);
/*
    #swagger.tags = ['Libros']
    #swagger.summary = 'Sincronizar catálogo inicial de libros'
    #swagger.description = 'Obtiene libros desde la API de Google Books y los guarda en la base de datos.'
    #swagger.responses[200] = {
        description: 'Catálogo sincronizado correctamente',
        schema: {
            $ref: '#/definitions/RespuestaSincronizacion'
        }
    }
    #swagger.responses[500] = {
        description: 'Error interno del servidor'
    }
*/

router.get('/', bookCtrl.getBooks);
/*
    #swagger.tags = ['Libros']
    #swagger.summary = 'Obtener todos los libros'
    #swagger.description = 'Retorna una lista con todos los libros disponibles en la base de datos.'
    #swagger.responses[200] = {
        description: 'Lista de libros obtenida correctamente',
        schema: {
            $ref: '#/definitions/Libro'
        }
    }
    #swagger.responses[500] = {
        description: 'Error interno del servidor'
    }
*/

router.post('/', verificarToken, auditoriaMiddelware('Libros'), bookCtrl.postBook);
/*
    #swagger.tags = ['Libros']
    #swagger.summary = 'Crear un nuevo libro'
    #swagger.description = 'Crea un nuevo libro en la base de datos.'
    #swagger.parameters[0] = {
        name: 'libro',
        in: 'body',
        description: 'Datos del libro a crear',
        required: true,
        schema: {
            $ref: '#/definitions/Libro'
        }
    }
    #swagger.responses[201] = {
        description: 'Libro creado correctamente',
        schema: {
            $ref: '#/definitions/Libro'
        }
    }
    #swagger.responses[500] = {
        description: 'Error interno del servidor'
    }
*/

router.put('/:id', verificarToken, auditoriaMiddelware('Libros'), bookCtrl.putBook);
/*
    #swagger.tags = ['Libros']
    #swagger.summary = 'Actualizar un libro por ID'
    #swagger.description = 'Actualiza los datos de un libro específico en la base de datos utilizando su ID.'
    #swagger.parameters[0] = {
        name: 'id',
        in: 'path',
        description: 'ID del libro a actualizar',
        required: true,
        type: 'string'
    }
    #swagger.parameters[1] = {
        name: 'libro',
        in: 'body',
        description: 'Datos actualizados del libro',
        required: true,
        schema: {
            $ref: '#/definitions/Libro'
        }
    }
    #swagger.responses[200] = {
        description: 'Libro actualizado correctamente',
        schema: {
            $ref: '#/definitions/Libro'
        }
    }
    #swagger.responses[500] = {
        description: 'Error interno del servidor'
    }
*/
router.delete('/:id', verificarToken, auditoriaMiddelware('Libros'), bookCtrl.deleteBook);
/*
    #swagger.tags = ['Libros']
    #swagger.summary = 'Eliminar un libro por ID'
    #swagger.description = 'Elimina un libro específico de la base de datos utilizando su ID.'
    #swagger.responses[200] = {
        description: 'Libro eliminado correctamente',
        schema: {
            $ref: '#/definitions/Libro'
        }
    }
    #swagger.responses[500] = {
        description: 'Error interno del servidor'
    }
*/

router.get('/:id', bookCtrl.getBookById);

module.exports = router;