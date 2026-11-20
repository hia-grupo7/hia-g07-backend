jest.mock('../config/database', () => require('./helpers/mockDatabase'));

const jwt = require('jsonwebtoken');
const Usuario = require('../src/models/usuario.model');
const { verificarToken, permitirRoles } = require('../src/middlewares/auth.middleware');

const crearRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const tokenValido = (payload = { id: 7, rol: 'cliente' }) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

describe('verificarToken', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('401 si no se envia el header Authorization', async () => {
    const res = crearRes();
    const next = jest.fn();

    await verificarToken({ headers: {} }, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('403 si el token esta firmado con otra clave', async () => {
    const res = crearRes();
    const next = jest.fn();
    const tokenAjeno = jwt.sign({ id: 7 }, 'otra-clave');

    await verificarToken({ headers: { authorization: `Bearer ${tokenAjeno}` } }, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('404 si el usuario del token ya no existe', async () => {
    jest.spyOn(Usuario, 'findByPk').mockResolvedValue(null);
    const res = crearRes();
    const next = jest.fn();

    await verificarToken({ headers: { authorization: `Bearer ${tokenValido()}` } }, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  test('403 si el usuario esta inactivo', async () => {
    jest.spyOn(Usuario, 'findByPk').mockResolvedValue({ id: 7, estado: false });
    const res = crearRes();
    const next = jest.fn();

    await verificarToken({ headers: { authorization: `Bearer ${tokenValido()}` } }, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('deja pasar a un usuario activo y carga req.usuario con su rol', async () => {
    jest.spyOn(Usuario, 'findByPk').mockResolvedValue({ id: 7, estado: true });
    const req = { headers: { authorization: `Bearer ${tokenValido()}` } };
    const res = crearRes();
    const next = jest.fn();

    await verificarToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.usuario.id).toBe(7);
    expect(req.usuario.rol).toBe('cliente');
  });
});

describe('permitirRoles', () => {
  test('permite el paso si el rol esta autorizado', () => {
    const res = crearRes();
    const next = jest.fn();

    permitirRoles('administrador', 'empleado')({ usuario: { rol: 'empleado' } }, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('responde 403 si el rol no esta autorizado', () => {
    const res = crearRes();
    const next = jest.fn();

    permitirRoles('administrador')({ usuario: { rol: 'cliente' } }, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
