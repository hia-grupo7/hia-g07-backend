jest.mock('../config/database', () => require('./helpers/mockDatabase'));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const Usuario = require('../src/models/usuario.model');
const Auditoria = require('../src/models/auditoria.model');

// SEC-02: GET /api/auditorias era publico y mostraba el historial completo, incluidos los accesos al honeypot.
const tokenDe = (rol) => jwt.sign({ id: 7, rol }, process.env.JWT_SECRET, { expiresIn: '1h' });

afterEach(() => {
  jest.restoreAllMocks();
});

describe('GET /api/auditorias', () => {
  test('401 sin token y no consulta la base', async () => {
    const buscar = jest.spyOn(Auditoria, 'findAndCountAll').mockResolvedValue({ count: 0, rows: [] });

    const res = await request(app).get('/api/auditorias');

    expect(res.status).toBe(401);
    expect(buscar).not.toHaveBeenCalled();
  });

  test('403 con token de un rol que no es admin', async () => {
    jest.spyOn(Usuario, 'findByPk').mockResolvedValue({ id: 7, estado: true });
    const buscar = jest.spyOn(Auditoria, 'findAndCountAll').mockResolvedValue({ count: 0, rows: [] });

    const res = await request(app)
      .get('/api/auditorias')
      .set('Authorization', `Bearer ${tokenDe('empleado')}`);

    expect(res.status).toBe(403);
    expect(buscar).not.toHaveBeenCalled();
  });

  test('200 para un admin con el listado paginado', async () => {
    jest.spyOn(Usuario, 'findByPk').mockResolvedValue({ id: 7, estado: true });
    jest.spyOn(Auditoria, 'findAndCountAll').mockResolvedValue({ count: 1, rows: [{ id: 1, accion: 'HONEYPOT' }] });

    const res = await request(app)
      .get('/api/auditorias')
      .set('Authorization', `Bearer ${tokenDe('admin')}`);

    expect(res.status).toBe(200);
    expect(res.body.totalItems).toBe(1);
    expect(res.body.auditorias).toEqual([{ id: 1, accion: 'HONEYPOT' }]);
  });
});
