const Usuario = require('../models/usuario.model');
const HistorialAcceso = require('../models/historialAcceso.model');
const Rol = require('../models/rol.model');
const emailService = require('./email.service');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

class AuthService {
  
  generarJWT(usuario) {
    const rolNombre = usuario.Rol?.nombre || usuario.rol || usuario.rolNombre || 'cliente';

    return jwt.sign(
      { id: usuario.id, email: usuario.email, rol: rolNombre },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
  }

  async registrarAcceso(usuarioId, ip, dispositivo) {
    return await HistorialAcceso.create({
      usuarioId,
      ip: ip || '127.0.0.1',
      dispositivo: dispositivo || 'Desconocido'
    });
  }

  async registrarUsuario(datosUsuario) {
    const { email, password, nombre, apellido, rolNombre } = datosUsuario;
    
    const existeUsuario = await Usuario.findOne({ where: { email } });
    if (existeUsuario) {
      throw new Error('El correo electrónico ya está registrado.');
    }

    // Buscamos el ID del rol solicitado (por defecto 'cliente')
    const nombreRolBuscar = rolNombre || 'cliente';
    const rol = await Rol.findOne({ where: { nombre: nombreRolBuscar } });
    if (!rol) {
      throw new Error(`El rol '${nombreRolBuscar}' no existe en el sistema.`);
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHasheado = await bcrypt.hash(password, salt);

    const usuarioCreado = await Usuario.create({
      email,
      passwordHash: passwordHasheado,
      nombre,
      apellido,
      rolId: rol.id
    });

    await usuarioCreado.reload({ include: [{ model: Rol, as: 'Rol' }] });
    return usuarioCreado;
  }

  async loginUsuario(email, password) {
    // Buscamos al usuario incluyendo su rol asociado
    const usuario = await Usuario.findOne({ 
      where: { email },
      include: [{ model: Rol, as: 'Rol' }]
    });

    if (!usuario) {
      throw new Error('Credenciales incorrectas.');
    }

    if (!usuario.passwordHash) {
      throw new Error('Esta cuenta utiliza inicio de sesión por redes sociales.');
    }

    const passwordCorrecto = await bcrypt.compare(password, usuario.passwordHash);
    if (!passwordCorrecto) {
      throw new Error('Credenciales incorrectas.');
    }

    if (!usuario.estado) {
      throw new Error('Tu cuenta se encuentra suspendida.');
    }

    return usuario;
  }

  async solicitar2FA(usuario) {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiracion = new Date(Date.now() + 5 * 60 * 1000); 

    usuario.otpCode = otp;
    usuario.otpExpiresAt = expiracion;
    await usuario.save();

    await emailService.enviarCodigoOTP(usuario.email, otp);
  }

  async verificar2FA(userId, codigoOTP) {
    const usuario = await Usuario.findByPk(userId, {
      include: [{ model: Rol, as: 'Rol' }]
    });

    if (!usuario) {
      throw new Error('Usuario no encontrado.');
    }

    if (!usuario.otpCode || usuario.otpCode !== codigoOTP) {
      throw new Error('Código de seguridad incorrecto.');
    }

    if (new Date() > usuario.otpExpiresAt) {
      throw new Error('El código de seguridad ha expirado.');
    }

    usuario.otpCode = null;
    usuario.otpExpiresAt = null;
    await usuario.save();

    return usuario;
  }

  async loginConGoogle(tokenGoogle) {
    const ticket = await googleClient.verifyIdToken({
      idToken: tokenGoogle,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const { email, given_name, family_name, sub: googleId } = payload;

    let usuario = await Usuario.findOne({ 
      where: { email },
      include: [{ model: Rol, as: 'Rol' }]
    });

    // Si no existe, buscamos el rol 'cliente' para asociárselo
    if (!usuario) {
      const rolCliente = await Rol.findOne({ where: { nombre: 'cliente' } });
      usuario = await Usuario.create({
        email,
        nombre: given_name || 'Usuario Google',
        apellido: family_name || '',
        rolId: rolCliente.id,
        googleId
      });
      // Recargar para incluir el Rol recién asignado
      await usuario.reload({ include: [{ model: Rol, as: 'Rol' }] });
    } else if (!usuario.googleId) {
      usuario.googleId = googleId;
      await usuario.save();
    }

    if (!usuario.estado) {
      throw new Error('Tu cuenta se encuentra suspendida.');
    }

    return usuario;
  }

  async loginConFacebook(tokenFacebook) {
    const response = await axios.get(`https://graph.facebook.com/me`, {
      params: {
        fields: 'id,name,email,first_name,last_name',
        access_token: tokenFacebook
      }
    });

    const { id: facebookId, email, first_name, last_name, name } = response.data;
    const emailUsuario = email || `${facebookId}@facebook.com`;

    let usuario = await Usuario.findOne({ 
      where: { email: emailUsuario },
      include: [{ model: Rol, as: 'Rol' }]
    });

    if (!usuario) {
      const rolCliente = await Rol.findOne({ where: { nombre: 'cliente' } });
      usuario = await Usuario.create({
        email: emailUsuario,
        nombre: first_name || name || 'Usuario Facebook',
        apellido: last_name || '',
        rolId: rolCliente.id,
        facebookId
      });
      await usuario.reload({ include: [{ model: Rol, as: 'Rol' }] });
    } else if (!usuario.facebookId) {
      usuario.facebookId = facebookId;
      await usuario.save();
    }

    if (!usuario.estado) {
      throw new Error('Tu cuenta se encuentra suspendida.');
    }

    return usuario;
  }
}

module.exports = new AuthService();