const Auditoria = require('../models/auditoria.model');

const resolverUsuarioAuditoria = (req) => {
    return req.usuario?.id || req.user?.id || req.auth?.user?.id || req.headers['usuario-id'] || req.body?.usuarioOperativo || null;
};

const auditoriaMiddelware = (tablaAfectada) => { 
    return async (req, res, next) => {
        try {
            // 1- Capturar identidad.
            // Prioriza al usuario autenticado por JWT y conserva compatibilidad con headers/body.
            const usuarioId = resolverUsuarioAuditoria(req);

            if (!usuarioId) {
                return res.status(401).json({
                    message: `No se puede auditar la acción en ${tablaAfectada}. Falta identificar al usuario (Token ausente o inválido).`
                });
            }

            // 2- Identificamos la acción que se está realizando
            let accion = 'LEER';
            if (req.method === 'POST') accion = 'CREAR';
            if (req.method === 'PUT' || req.method === 'PATCH') accion = 'MODIFICAR';
            if (req.method === 'DELETE') accion = 'ELIMINAR';
            if (req.originalUrl.includes('/rol')) accion = 'CAMBIAR-ROL';

            // 3- Obtenemos el Id del registro afectado de los parámetros de Express
            const registroId = req.params.id || null;

            // 4- Detalle descriptivo dinámico
            const detalle = `El usuario ${usuarioId} ejecutó la acción ${accion} sobre la tabla [${tablaAfectada}] en la ruta ${req.originalUrl}`;

            // 5- Guardamos en la BD
            await Auditoria.create({
                accion,
                tablaAfectada,
                registroId,
                detalle,
                fecha: new Date(),
                usuarioId: parseInt(usuarioId, 10)
            });

            next();

        } catch (error) {
            console.error(`Error en el middleware de auditoría (${tablaAfectada}):`, error);
            res.status(500).json({ message: 'Error interno en el proceso de auditoría', error: error.message });
        }
    }
}

module.exports = auditoriaMiddelware;