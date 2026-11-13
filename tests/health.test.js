jest.mock('../config/database', () => require('./helpers/mockDatabase'));

const request = require('supertest');
const sequelize = require('../config/database');
const app = require('../app');

describe('GET /api/health', () => {
  test('responde 200 y estado ok cuando la base de datos responde', async () => {
    sequelize.authenticate.mockResolvedValue();

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.servicio).toBe('rayuela-backend');
    expect(res.body.baseDeDatos).toBe('conectada');
    expect(typeof res.body.uptimeSegundos).toBe('number');
  });

  test('responde 503 cuando la base de datos no esta disponible', async () => {
    sequelize.authenticate.mockRejectedValue(new Error('connection refused'));

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('error');
    expect(res.body.baseDeDatos).toBe('desconectada');
  });
});
