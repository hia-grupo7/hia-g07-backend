jest.mock('../config/database', () => require('./helpers/mockDatabase'));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const Usuario = require('../src/models/usuario.model');

// SEC-02: GET /api/admin/usuario era publico y devolvia otpCode/otpExpiresAt de los usuarios.
const tokenDe = (rol) => jwt.sign({ id: 7, rol }, process.env.JWT_SECRET, { expiresIn: '1h' });

afterEach(() => {
  jest.restoreAllMocks();
});

describe('GET /api/admin/usuario', () => {
  test('401 sin token (ya no es publico) y no consulta la base', async () => {
    const buscar = jest.spyOn(Usuario, 'findAll').mockResolvedValue([]);

    const res = await request(app).get('/api/admin/usuario');

    expect(res.status).toBe(401);
    expect(buscar).not.toHaveBeenCalled();
  });

  test('403 con token de un rol que no es admin', async () => {
    jest.spyOn(Usuario, 'findByPk').mockResolvedValue({ id: 7, estado: true });
    const buscar = jest.spyOn(Usuario, 'findAll').mockResolvedValue([]);

    const res = await request(app)
      .get('/api/admin/usuario')
      .set('Authorization', `Bearer ${tokenDe('cliente')}`);

    expect(res.status).toBe(403);
    expect(buscar).not.toHaveBeenCalled();
  });

  test('200 para un admin y la consulta excluye los campos sensibles', async () => {
    jest.spyOn(Usuario, 'findByPk').mockResolvedValue({ id: 7, estado: true });
    const buscar = jest.spyOn(Usuario, 'findAll').mockResolvedValue([{ id: 1, nombre: 'Laura' }]);

    const res = await request(app)
      .get('/api/admin/usuario')
      .set('Authorization', `Bearer ${tokenDe('admin')}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 1, nombre: 'Laura' }]);
    const { exclude } = buscar.mock.calls[0][0].attributes;
    expect(exclude).toEqual(expect.arrayContaining(['passwordHash', 'otpCode', 'otpExpiresAt', 'googleId']));
  });
});
