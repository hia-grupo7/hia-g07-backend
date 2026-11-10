const jwt = require('jsonwebtoken');
const Usuario = require('../models/usuario.model');

const verificarToken = async (req, res, next) => {
  const bearerHeader = req.headers['authorization'];

  if (!bearerHeader || !bearerHeader.startsWith('Bearer ')) {
    return res.status(401).json({ status: 0, msg: 'Acceso denegado. Token no proporcionado.' });
  }

  const token = bearerHeader.split(' ')[1];

  try {
    const verificado = jwt.verify(token, process.env.JWT_SECRET);
    const usuario = await Usuario.findByPk(verificado.id);
    
    if (!usuario) {
      return res.status(404).json({ status: 0, msg: 'Usuario no encontrado.' });
    }
    if (!usuario.estado) {
      return res.status(403).json({ status: 0, msg: 'El usuario se encuentra inactivo.' });
    }

    req.usuario = usuario;
    req.user = usuario;
    req.usuario.rol = verificado.rol || usuario.rol || usuario.Rol?.nombre;
    next();
  } catch (error) {
    return res.status(403).json({ status: 0, msg: 'Token inválido o expirado.' });
  }
};

const permitirRoles = (...rolesPermitidos) => {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(500).json({ status: 0, msg: 'Error de autenticación interna.' });
    }

    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({ status: 0, msg: 'Acceso denegado: rol no autorizado.' });
    }

    next();
  };
};

module.exports = {
  verificarToken,
  permitirRoles
};