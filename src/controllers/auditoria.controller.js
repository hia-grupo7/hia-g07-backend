const auditoriaService = require('../services/auditoria.service');

const auditoriaCtrl = {};

auditoriaCtrl.listarAuditorias = async (req, res) => {
   try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const search = req.query.search || null;
        const fecha = req.query.fecha || null; // Espera formato YYYY-MM-DD

        const resultado = await auditoriaService.obtenerAuditoriasPaginadas(page, limit, search, fecha);
        
        return res.status(200).json(resultado);
    } catch (error) {
        console.error('Error en listarAuditorias ctrl:', error);
        return res.status(500).json({ 
            message: 'Error interno al obtener el historial de auditoría.',
            error: error.message 
        });
    }
};

module.exports = auditoriaCtrl;