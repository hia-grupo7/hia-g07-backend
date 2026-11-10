const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { reglasRegistro, reglasLogin, validarCampos } = require('../middlewares/validator.middleware');
const { verificarToken } = require('../middlewares/auth.middleware'); // <-- Agrega esta línea

// Rutas Públicas de Auth
router.post('/registrar', reglasRegistro, validarCampos, authController.registrar);
router.post('/login', reglasLogin, validarCampos, authController.login);
router.post('/verificar-2fa', authController.verificar2FA);
router.post('/google', authController.googleLogin);
router.post('/facebook', authController.facebookLogin);
// Ruta Protegida de Prueba
router.get('/perfil', verificarToken, (req, res) => {
  res.json({
    status: 1,
    msg: "Acceso concedido. Tu Token JWT es válido.",
    usuario: {
      id: req.usuario.id,
      nombre: req.usuario.nombre,
      apellido: req.usuario.apellido,
      email: req.usuario.email
    }
  });
});

module.exports = router;