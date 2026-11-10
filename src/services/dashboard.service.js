const { Op, fn, col } = require('sequelize');
const Venta = require('../models/venta.model');
const VentaDetalle = require('../models/ventaDetalle.model');
const Book = require('../models/book.model');
const Reserva = require('../models/reserva.model');
const Inventory = require('../models/inventory.model');

const dashBoardService = {};

dashBoardService.getTopLibros = async () => {
    try{
        const topLibros = await VentaDetalle.findAll({
            attributes: [
                'idLibro',
                [fn('SUM', col('cantidad')), 'totalVendido']
            ],
            include: [{
                model: Book,
                as: 'book',
                attributes: ['title']
            }],
            group: ['idLibro', 'book.id'],
            order: [['totalVendido', 'DESC']],
            limit: 5
        });
        return topLibros; 

    }catch (error){
        throw new Error(`Error al obtener los libros más vendidos: ${error.message}`);
    }
}

dashBoardService.getVentasMensuales = async () => {
    try {
        const fechaLimite = new Date();
        
        fechaLimite.setMonth(fechaLimite.getMonth() - 6);

        const ventas = await Venta.findAll({
            attributes: [
                [fn('DATE_PART', 'month', col('createdAt')), 'mes'],
                [fn('SUM', col('total')), 'totalIngresos']
            ],
            where: {
                createdAt: {
                    [Op.gte]: fechaLimite
                }
            },
            group: [fn('DATE_PART', 'month', col('createdAt'))],
            order: [['mes', 'ASC']]
        });
        return ventas;
    } catch (error) {
        throw new Error(`Error al obtener ventas mensuales: ${error.message}`);
    }
};

// En tu dashboard.service.js...

dashBoardService.getMetricasCards = async () => {
    try {
        const ahora = new Date();
        
        
        const inicioMesActual = new Date(ahora.getFullYear(), ahora.getMonth(), 1);

        
        const inicioMesAnterior = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
        const finMesAnterior = new Date(ahora.getFullYear(), ahora.getMonth(), 0, 23, 59, 59); 

        //  1. Sumar ingresos MES ACTUAL
        const ingresosMesActual = await Venta.sum('total', {
            where: {
                createdAt: { [Op.gte]: inicioMesActual },
                estado: 'completado'
            }
        }) || 0;

        //  2. Sumar ingresos MES ANTERIOR
        const ingresosMesAnterior = await Venta.sum('total', {
            where: {
                createdAt: {
                    [Op.between]: [inicioMesAnterior, finMesAnterior]
                },
                estado: 'completado'
            }
        }) || 0;

        //  3. Calcular el porcentaje real de variación
        let porcentajeVsMesAnterior = 0;

        if (ingresosMesAnterior > 0) {
            // ((Actual - Anterior) / Anterior) * 100
            const calculo = ((ingresosMesActual - ingresosMesAnterior) / ingresosMesAnterior) * 100;
            porcentajeVsMesAnterior = Math.round(calculo); 
        } else if (ingresosMesActual > 0 && ingresosMesAnterior === 0) { //evita la división por 0
            // Si el mes pasado fue 0 y este mes se vendió algo, el crecimiento es del 100%
            porcentajeVsMesAnterior = 100;
        }

        //  4. Contar reservas activas
        const reservasActivas = await Reserva.count({
            where: { estado: 'activa' }
        });

        //  5. Contar bajo stock crítico
        const bajoStockCritico = await Inventory.count({
            where: { stock: { [Op.lte]: 3 } }
        });

        
        return {
            ingresos: {
                total: parseFloat(ingresosMesActual),
                porcentaje: porcentajeVsMesAnterior 
            },
            reservasActivas: reservasActivas,
            bajoStockCritico: bajoStockCritico
        };

    } catch (error) {
        throw new Error(`Error al calcular métricas reales de las cards: ${error.message}`);
    }
};


module.exports = dashBoardService;