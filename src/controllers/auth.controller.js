const authService = require('../services/auth.service');

class AuthController {
  
  async registrar(req, res) {
    try {
      const nuevoUsuario = await authService.registrarUsuario(req.body);
      const token = authService.generarJWT(nuevoUsuario);

      res.status(201).json({
        status: 1,
        msg: 'Usuario registrado exitosamente.',
        token,
        usuario: {
          id: nuevoUsuario.id,
          email: nuevoUsuario.email,
          nombre: nuevoUsuario.nombre,
          rol: nuevoUsuario.Rol?.nombre || 'cliente'
        }
      });
    } catch (error) {
      res.status(400).json({ status: 0, msg: error.message });
    }
  }

  async login(req, res) {
    const { email, password } = req.body;
    try {
      const usuario = await authService.loginUsuario(email, password);

      // 2FA solo para Administradores o Empleados
      if (usuario.Rol.nombre === 'administrador' || usuario.Rol.nombre === 'empleado') {
        await authService.solicitar2FA(usuario);
        return res.status(200).json({
          status: 2, 
          msg: 'Se ha enviado un código de verificación a su email.',
          userId: usuario.id
        });
      }

      // Cliente común ingresa directo
      const ip = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
      const dispositivo = req.headers['user-agent'] || 'Dispositivo Web';
      await authService.registrarAcceso(usuario.id, ip, dispositivo);

      const token = authService.generarJWT(usuario);

      res.status(200).json({
        status: 1,
        msg: 'Inicio de sesión exitoso.',
        token,
        usuario: {
          id: usuario.id,
          email: usuario.email,
          nombre: usuario.nombre,
          rol: usuario.Rol.nombre
        }
      });
    } catch (error) {
      res.status(400).json({ status: 0, msg: error.message });
    }
  }

  async verificar2FA(req, res) {
    const { userId, otpCode } = req.body;
    try {
      const usuario = await authService.verificar2FA(userId, otpCode);

      const ip = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
      const dispositivo = req.headers['user-agent'] || 'Dispositivo Verificado';
      await authService.registrarAcceso(usuario.id, ip, dispositivo);

      const token = authService.generarJWT(usuario);

      res.status(200).json({
        status: 1,
        msg: 'Segundo factor verificado con éxito.',
        token,
        usuario: {
          id: usuario.id,
          email: usuario.email,
          nombre: usuario.nombre,
          rol: usuario.Rol.nombre
        }
      });
    } catch (error) {
      res.status(400).json({ status: 0, msg: error.message });
    }
  }

  async googleLogin(req, res) {
    const { tokenGoogle } = req.body;
    try {
      const usuario = await authService.loginConGoogle(tokenGoogle);
      
      const ip = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
      const dispositivo = req.headers['user-agent'] || 'Google Login';
      await authService.registrarAcceso(usuario.id, ip, dispositivo);

      const token = authService.generarJWT(usuario);

      res.status(200).json({
        status: 1,
        msg: 'Inicio de sesión con Google exitoso.',
        token,
        usuario: {
          id: usuario.id,
          email: usuario.email,
          nombre: usuario.nombre,
          rol: usuario.Rol.nombre
        }
      });
    } catch (error) {
      res.status(400).json({ status: 0, msg: error.message });
    }
  }

  async facebookLogin(req, res) {
    const { tokenFacebook } = req.body;
    try {
      const usuario = await authService.loginConFacebook(tokenFacebook);

      const ip = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
      const dispositivo = req.headers['user-agent'] || 'Facebook Login';
      await authService.registrarAcceso(usuario.id, ip, dispositivo);

      const token = authService.generarJWT(usuario);

      res.status(200).json({
        status: 1,
        msg: 'Inicio de sesión con Facebook exitoso.',
        token,
        usuario: {
          id: usuario.id,
          email: usuario.email,
          nombre: usuario.nombre,
          rol: usuario.Rol.nombre
        }
      });
    } catch (error) {
      res.status(400).json({ status: 0, msg: error.message });
    }
  }
}

module.exports = new AuthController();