const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { Op } = require('sequelize');
const Venta = require('../models/venta.model');

const reporteService = {};


reporteService.generarExcelVentas = async () => {
    try {
        const ahora = new Date();
        const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);

        const ventas = await Venta.findAll({
            where: { createdAt: { [Op.gte]: inicioMes } },
            order: [['createdAt', 'DESC']]
        });

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Ventas del Mes');

        // Definimos las columnas
        worksheet.columns = [
            { header: 'ID Venta', key: 'id', width: 12 },
            { header: 'Fecha', key: 'fecha', width: 20 },
            { header: 'Estado', key: 'estado', width: 15 },
            { header: 'Total ($)', key: 'total', width: 18 }
        ];

        // Estilo de la cabecera
        worksheet.getRow(1).font = { bold: true };
        
        let sumaTotal = 0;

        // las filas
        ventas.forEach(v => {
            const total = parseFloat(v.total) || 0;
            sumaTotal += total;
            
            worksheet.addRow({
                id: `#${v.id}`,
                fecha: new Date(v.createdAt).toLocaleDateString('es-AR'),
                estado: v.estado.toUpperCase(),
                total: total
            });
        });

        // Fila de Total Acumulado
        worksheet.addRow([]); // Fila vacía para separar
        const totalRow = worksheet.addRow({
            estado: 'TOTAL GENERAL',
            total: sumaTotal
        });
        totalRow.font = { bold: true };

        return workbook;

    }catch (error) {
        throw new Error(`Error al generar Excel: ${error.message}`);
    }
}


reporteService.generarPdfVentas = async () => {
    try {
        const ahora = new Date();
        const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
        
        
        const ventas = await Venta.findAll({
            where: { createdAt: { [Op.gte]: inicioMes } },
            order: [['createdAt', 'DESC']]
        });

        
        const doc = new PDFDocument({ margin: 50 });

    
        doc.fontSize(20).text('Reporte de Ventas Mensual', { align: 'center' });
        doc.fontSize(12).text(`Generado: ${ahora.toLocaleDateString('es-AR')}`, { align: 'center' });
        
        
        doc.moveDown(2);

        
        doc.font('Helvetica-Bold').fontSize(12);
        doc.text('ID | Fecha       | Estado      | Total', { underline: true });
        doc.moveDown(0.5); // Medio espacio para separar del contenido

        
        doc.font('Helvetica').fontSize(10);
        let sumaTotal = 0;

        
        ventas.forEach(v => {
            const total = parseFloat(v.total) || 0;
            sumaTotal += total;
            const fecha = new Date(v.createdAt).toLocaleDateString('es-AR');
            
            
            doc.text(`#${v.id} | ${fecha} | ${v.estado.toUpperCase()} | $${total.toFixed(2)}`);
        });

        
        doc.moveDown(1);
        doc.font('Helvetica-Bold').fontSize(12);
        doc.text(`TOTAL RECAUDADO: $${sumaTotal.toFixed(2)}`);

        
        return doc;
    } catch (error) {
        throw new Error(`Error al generar PDF: ${error.message}`);
    }
};



module.exports = reporteService;