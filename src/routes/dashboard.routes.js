const dashboardCtrl = require('../controllers/dashboard.controller');
const express = require('express');
const router = express.Router();


router.get('/top-libros', dashboardCtrl.getTopLibros);
/*
    #swagger.tags = ['Dashboard']
    #swagger.summary = 'Obtener los 5 libros más vendidos'
    #swagger.description = 'Retorna un listado con los IDs, títulos y cantidades acumuladas de los 5 libros con mayor volumen de ventas.'
    #swagger.responses[200] = {
        description: 'Top de libros obtenido correctamente',
        schema: {
            type: 'array',
            items: {
                idLibro: 1,
                totalVendido: 42,
                book: { title: 'Harry Potter y la piedra filosofal' }
            }
        }
    }
    #swagger.responses[500] = {
        description: 'Error interno del servidor al procesar las estadísticas'
    }
*/


router.get('/ventas-mensuales', dashboardCtrl.getVentasMensuales);
/*
    #swagger.tags = ['Dashboard']
    #swagger.summary = 'Obtener facturación de los últimos 6 meses'
    #swagger.description = 'Retorna el total de ingresos acumulados agrupados cronológicamente por número de mes.'
    #swagger.responses[200] = {
        description: 'Estadísticas mensuales obtenidas correctamente',
        schema: {
            type: 'array',
            items: {
                mes: 7,
                totalIngresos: 425000.00
            }
        }
    }
    #swagger.responses[500] = {
        description: 'Error interno del servidor al procesar la facturación'
    }
*/

router.get('/metricas-cards', dashboardCtrl.getMetricasCards);
/*
    #swagger.tags = ['Dashboard']
    #swagger.summary = 'Obtener métricas clave para las tarjetas superiores'
    #swagger.description = 'Retorna el total de ingresos mensuales con su porcentaje de variación real, la cantidad de reservas activas y el conteo de libros con stock crítico.'
    #swagger.responses[200] = {
        description: 'Métricas calculadas con éxito',
        schema: {
            ingresos: { total: 185200.00, porcentaje: 12 },
            reservasActivas: 45,
            bajoStockCritico: 8
        }
    }
    #swagger.responses[500] = {
        description: 'Error interno del servidor al procesar las métricas de las tarjetas'
    }
*/


router.get('/reporte-excel', dashboardCtrl.descargarExcel);
/*
    #swagger.tags = ['Dashboard']
    #swagger.summary = 'Descargar reporte de ventas en formato Excel'
    #swagger.description = 'Genera y descarga un archivo .xlsx con el desglose de ventas del mes actual.'
    #swagger.responses[200] = { description: 'Archivo Excel generado correctamente' }
    #swagger.responses[500] = { description: 'Error interno al generar el archivo' }
*/

router.get('/reporte-pdf', dashboardCtrl.descargarPdf);
/*
    #swagger.tags = ['Dashboard']
    #swagger.summary = 'Descargar reporte de ventas en formato PDF'
    #swagger.description = 'Genera y descarga un archivo .pdf listo para imprimir con el resumen de ventas del mes.'
    #swagger.responses[200] = { description: 'Archivo PDF generado correctamente' }
    #swagger.responses[500] = { description: 'Error interno al generar el archivo' }
*/


module.exports = router;