const Venta = require('../models/venta.model');
const VentaDetalle = require('../models/ventaDetalle.model');
const Inventory = require('../models/inventory.model');
const Reserva = require('../models/reserva.model');
const axios = require('axios');

const ventaService = {};

const MAX_RESERVAS_POR_CHECKOUT = 3;

const getItemBookId = (item) => item.idLibro || item.bookId;

const getInventoryForItem = async (item) => {
    const idLibro = getItemBookId(item);

    if (idLibro) {
        const inventarioPorLibro = await Inventory.findOne({ where: { bookId: idLibro } });
        if (inventarioPorLibro) {
            return inventarioPorLibro;
        }
    }

    if (item.id) {
        return Inventory.findByPk(item.id);
    }

    return null;
};

ventaService.crearVenta = async (idUsuario, payer_email, itemsCarrito, idCupon = null) => {
    try {
        let totalVenta = 0;
        let cantidadReservas = 0;

        // 1. Verificar stock y sumar total
        for (const item of itemsCarrito) {
            const cantidad = Number(item.cantidad) || 1;
            const esReserva = item.tipo === 'reserva';
            const inventario = await getInventoryForItem(item);

            if (!inventario) {
                throw new Error(`No existe inventario para el libro con ID: ${getItemBookId(item) || item.id}`);
            }

            if (esReserva) {
                cantidadReservas += cantidad;
            } else if (inventario.stock < cantidad) {
                throw new Error(`Stock insuficiente para el libro con ID: ${inventario.bookId}`);
            }

            if (!esReserva) {
                totalVenta += (cantidad * Number(item.precioUnitario || 0));
            }
        }

        if (cantidadReservas > MAX_RESERVAS_POR_CHECKOUT) {
            throw new Error(`Solo se pueden reservar hasta ${MAX_RESERVAS_POR_CHECKOUT} libros por compra`);
        }

        // 2. Crear cabecera de Venta
        const nuevaVenta = await Venta.create({
            idUsuario: idUsuario,
            idCupon: idCupon,
            total: parseFloat(totalVenta.toFixed(2)),
            estado: 'pendiente' 
        });

        // 3. Crear detalles, descontar stock y armar array para Mercado Pago
        const detalles = [];
        const itemsParaMP = [];
        const reservas = [];

        for (const item of itemsCarrito) {
            const cantidad = Number(item.cantidad) || 1;
            const esReserva = item.tipo === 'reserva';
            const inventario = await getInventoryForItem(item);
            const idLibro = getItemBookId(item) || inventario.bookId;
            const precioUnit = parseFloat(Number(item.precioUnitario || 0).toFixed(2));

            // Para la BD
            detalles.push({
                idVenta: nuevaVenta.id,
                idLibro: idLibro,
                cantidad: cantidad,
                precioUnitario: precioUnit
            });

            // Para Mercado Pago (solo compras con precio > 0)
            if (!esReserva && precioUnit > 0) {
                itemsParaMP.push({
                    title: item.tituloLibro || 'Libro', 
                    quantity: cantidad,
                    unit_price: precioUnit,
                    currency_id: "ARS"
                });
            }

            if (esReserva) {
                const fechaVencimiento = new Date();
                fechaVencimiento.setHours(fechaVencimiento.getHours() + 48);

                for (let i = 0; i < cantidad; i++) {
                    const reserva = await Reserva.create({
                        idUsuario: idUsuario,
                        idLibro: idLibro,
                        fechaVencimiento: fechaVencimiento,
                        estado: 'activa'
                    });
                    reservas.push(reserva);
                }

                await inventario.update({
                    stock: Math.max(0, inventario.stock - cantidad),
                    reserved: inventario.reserved + cantidad
                });
            } else {
                await inventario.update({ stock: inventario.stock - cantidad });
            }
        }

        await VentaDetalle.bulkCreate(detalles);

        // 4. Generar el link de cobro en Mercado Pago si hay items comprados
        let urlPago = null;
        let sandboxUrlPago = null;

        if (itemsParaMP.length > 0) {
            const token = process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.ACCESS_TOKEN;
            if (!token) {
                throw new Error('No se encontró el token de Mercado Pago (MERCADOPAGO_ACCESS_TOKEN) en el archivo .env');
            }

            const url = "https://api.mercadopago.com/checkout/preferences";
            const body = {
                payer: {
                    email: payer_email
                },
                items: itemsParaMP,
                external_reference: nuevaVenta.id.toString(),
                back_urls: {
                    failure: "http://localhost:4200/pago/fallido",
                    pending: "http://localhost:4200/pago/pendiente",
                    success: "http://localhost:4200/pago/exitoso"
                }
            };

            const payment = await axios.post(url, body, {
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                }
            });

            urlPago = payment.data.init_point;
            sandboxUrlPago = payment.data.sandbox_init_point;
        }

        // 5. Retornar los datos de la BD + los links de pago
        return {
            ventaDB: nuevaVenta,
            reservasDB: reservas,
            urlPago: urlPago,
            sandboxUrlPago: sandboxUrlPago
        };
        
    } catch (error) {
        const mpDetalle = error.response?.data?.message || error.response?.data?.error || (error.response?.data ? JSON.stringify(error.response.data) : null);
        const mensajeFinal = mpDetalle ? `Error Mercado Pago: ${mpDetalle}` : error.message;
        console.error('Error en crearVenta:', mensajeFinal);
        throw new Error(mensajeFinal);
    }
};

module.exports = ventaService;
