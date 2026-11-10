const Reserva = require('../models/reserva.model');
const Inventory = require('../models/inventory.model');
const Book = require('../models/book.model');

const reservaService = {};

reservaService.crearReserva = async (idUsuario, idLibro) => {
    try {
        // 1. Buscar el inventario del libro
        const inventario = await Inventory.findOne({ where: { bookId: idLibro } });

        if (!inventario || inventario.stock < 1) {
            throw new Error('No hay stock disponible para reservar este libro.');
        }

        // 2. Calcular la fecha de vencimiento (ej. 48 horas a partir de ahora)
        const fechaVencimiento = new Date();
        fechaVencimiento.setHours(fechaVencimiento.getHours() + 48);

        // 3. Crear la Reserva en la base de datos
        const nuevaReserva = await Reserva.create({
            idUsuario: idUsuario,
            idLibro: idLibro,
            fechaVencimiento: fechaVencimiento,
            estado: 'activa'
        });

        // 4. Actualizar el Inventario: Restar 1 al stock y sumar 1 a reserved
        await inventario.update({
            stock: inventario.stock - 1,
            reserved: inventario.reserved + 1
        });

        return await Reserva.findByPk(nuevaReserva.id, {
            include: [{ model: Book, as: 'book' }]
        });

    } catch (error) {
        throw new Error(`Error al procesar la reserva: ${error.message}`);
    }
};
reservaService.obtenerReservasPorUsuario = async (idUsuario) => {
    try {
        return await Reserva.findAll({
            where: { idUsuario: idUsuario },
            include: [{ model: Book, as: 'book' }] // Trae los datos del libro
        });
    } catch (error) {
        throw new Error(`Error al obtener las reservas: ${error.message}`);
    }
};

// Función para cancelar una reserva y liberar el stock
reservaService.cancelarReserva = async (idReserva) => {
    try {
        const reserva = await Reserva.findByPk(idReserva);
        
        if (!reserva) {
            throw new Error('Reserva no encontrada');
        }
        if (reserva.estado !== 'activa') {
            throw new Error('La reserva ya fue cancelada o completada');
        }

        // 1. Cambiar el estado de la reserva a cancelada
        await reserva.update({ estado: 'cancelada' });

        // 2. Proceso inverso en Inventario: Sumar 1 a stock, restar 1 a reserved
        const inventario = await Inventory.findOne({ where: { bookId: reserva.idLibro } });
        if (inventario) {
            await inventario.update({
                stock: inventario.stock + 1,
                reserved: inventario.reserved > 0 ? inventario.reserved - 1 : 0
            });
        }

        return reserva;
    } catch (error) {
        throw new Error(`Error al cancelar la reserva: ${error.message}`);
    }
};

module.exports = reservaService;