const { body, validationResult } = require('express-validator');

const reglasRegistro = [
  body('email')
    .isEmail().withMessage('Debe proporcionar un email válido.')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres.')
    .trim()
    .escape(),
  body('nombre')
    .notEmpty().withMessage('El nombre es obligatorio.')
    .trim()
    .escape(),
  body('apellido')
    .notEmpty().withMessage('El apellido es obligatorio.')
    .trim()
    .escape(),
  body('rolNombre')
    .optional()
    .isIn(['cliente', 'empleado', 'administrador']).withMessage('Rol inválido.')
];

const reglasLogin = [
  body('email').isEmail().withMessage('Ingrese un correo de usuario válido.').normalizeEmail(),
  body('password').notEmpty().withMessage('La contraseña es obligatoria.').trim().escape()
];

const validarCampos = (req, res, next) => {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    return res.status(400).json({
      status: 0,
      msg: 'Error en la validación de datos de entrada.',
      errors: errores.array().map(err => ({ campo: err.path, msg: err.msg }))
    });
  }
  next();
};

module.exports = {
  reglasRegistro,
  reglasLogin,
  validarCampos
};