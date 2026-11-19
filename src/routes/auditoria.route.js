const express = require('express');
const router = express.Router();
const auditoriaCtrl = require('../controllers/auditoria.controller');
const { verificarToken, permitirRoles } = require('../middlewares/auth.middleware');

// SEC-02: el historial de auditoria (incluye los accesos al honeypot) era publico; ahora solo lo ve un admin.
router.get('/', verificarToken, permitirRoles('admin'), auditoriaCtrl.listarAuditorias);

module.exports = router;