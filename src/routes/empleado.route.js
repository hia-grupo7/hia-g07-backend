const express = require('express');
const router = express.Router();

const empleadoCtrl = require('../controllers/empleado.controller');
const auditoriaMiddelware = require('../middelwares/auditoria.middlware'); 


const { verificarToken, permitirRoles } = require('../middlewares/auth.middleware');


router.get('/', empleadoCtrl.getEmpleados);

router.post('/', verificarToken, auditoriaMiddelware('Usuarios'), empleadoCtrl.createEmpleado);

router.put('/:id', verificarToken, auditoriaMiddelware('Usuarios'), empleadoCtrl.updateEmpleado);

router.put('/:id/rol', verificarToken, auditoriaMiddelware('Usuarios'), empleadoCtrl.cambiarRol);

router.delete('/:id', verificarToken, auditoriaMiddelware('Usuarios'), empleadoCtrl.deleteLogico);

module.exports = router;