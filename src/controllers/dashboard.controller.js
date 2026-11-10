const dashboardService = require('../services/dashboard.service');
const reportService = require('../services/report.service');

const dashboardController = {};


dashboardController.getTopLibros = async (req, res) => {
    try {
        const top = await dashboardService.getTopLibros();
        res.json(top);
    } catch (error) {
        console.error('Error en controller top libros:', error.message);
        res.status(500).json({
            error: 'Error al obtener el top de libros',
            detalle: error.message
        });
    }
};

dashboardController.getVentasMensuales = async (req, res) => {
    try {
        const ventas = await dashboardService.getVentasMensuales();
        res.json(ventas);
    } catch (error) {
        console.error('Error en controller ventas mensuales:', error.message);
        res.status(500).json({
            error: 'Error al obtener las ventas mensuales',
            detalle: error.message
        });
    }
};

dashboardController.getMetricasCards = async (req, res) => {
    try {
        
        const metricas = await dashboardService.getMetricasCards();
        
        
        res.json(metricas);
    } catch (error) {
        console.error('Error en controller metricas cards:', error.message);
        res.status(500).json({
            error: 'Error al obtener las métricas del dashboard',
            detalle: error.message
        });
    }
};


dashboardController.descargarExcel = async (req, res) => {
    try {
        const workbook = await reportService.generarExcelVentas();
        
        // configurar las cabeceras HTTP para que el navegador entienda que es un archivo Excel
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=reporte-ventas.xlsx');
        
        // Escribir el archivo directamente en la respuesta
        await workbook.xlsx.write(res);
        res.end(); //finaliza el documento 
    } catch (error) {
        console.error('Error al descargar Excel:', error.message);
        res.status(500).json({ error: 'No se pudo generar el Excel', detalle: error.message });
    }
};


dashboardController.descargarPdf = async (req, res) => {
    try {
        const doc = await reportService.generarPdfVentas();
        
        // Configurar las cabeceras HTTP para que el navegador entienda que es un PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=reporte-ventas.pdf');
        
        // El PDFKit trabaja con streams
        doc.pipe(res);
        doc.end(); 
    } catch (error) {
        console.error('Error al descargar PDF:', error.message);
        res.status(500).json({ error: 'No se pudo generar el PDF', detalle: error.message });
    }
};




module.exports = dashboardController;