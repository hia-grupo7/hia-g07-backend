jest.mock('../config/database', () => require('./helpers/mockDatabase'));

const express = require('express');
const request = require('supertest');

// Cada prueba carga una copia nueva de la app: los contadores del limitador viven en memoria.
let app;
let register;
beforeEach(() => {
  jest.resetModules();
  ({ register } = require('prom-client'));
  app = require('../app');
});

const loginInvalido = () =>
  request(app).post('/api/auth/login').send({ email: 'no-es-un-correo', password: 'x' });

const valorMetrica = async (ruta) => {
  const texto = await register.metrics();
  const linea = texto.split('\n').find((l) => l.startsWith(`rayuela_rate_limit_hits_total{ruta="${ruta}"}`));
  return linea ? Number(linea.split(' ')[1]) : null;
};

describe('Rate limiting de /api/auth/login', () => {
  test('permite 5 intentos fallidos y bloquea el 6.º con HTTP 429', async () => {
    for (let i = 1; i <= 5; i++) {
      const res = await loginInvalido();
      expect(res.status).toBe(400);
    }
    const bloqueado = await loginInvalido();
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.body.status).toBe(0);
    expect(bloqueado.body.msg).toMatch(/Demasiados intentos/);
    expect(bloqueado.headers['retry-after']).toBeDefined();
  });

  test('sigue bloqueando los intentos siguientes dentro de la ventana', async () => {
    for (let i = 0; i < 5; i++) await loginInvalido();
    expect((await loginInvalido()).status).toBe(429);
    expect((await loginInvalido()).status).toBe(429);
  });

  test('un intento bloqueado incrementa rayuela_rate_limit_hits_total{ruta="login"}', async () => {
    expect(await valorMetrica('login')).toBe(0);
    for (let i = 0; i < 5; i++) await loginInvalido();
    await loginInvalido();
    await loginInvalido();
    expect(await valorMetrica('login')).toBe(2);
  });

  test('no afecta a otros endpoints (health y metrics siguen respondiendo)', async () => {
    const sequelize = require('../config/database');
    sequelize.authenticate.mockResolvedValue();
    for (let i = 0; i < 6; i++) await loginInvalido();
    expect((await request(app).get('/api/health')).status).toBe(200);
    expect((await request(app).get('/api/metrics')).status).toBe(200);
  });

  // nginx agrega la IP real al FINAL de X-Forwarded-For; lo que el cliente haya escrito queda antes.
  const loginDesde = (cadenaXff) =>
    request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', cadenaXff)
      .send({ email: 'no-es-un-correo', password: 'x' });

  test('falsificar entradas de X-Forwarded-For no permite eludir el bloqueo', async () => {
    for (let i = 0; i < 5; i++) await loginDesde('10.0.0.1, 198.51.100.1');
    expect((await loginDesde('10.9.9.9, 198.51.100.1')).status).toBe(429);
  });

  test('el contador es por IP: bloquear a un cliente no bloquea a otro', async () => {
    for (let i = 0; i < 6; i++) await loginDesde('198.51.100.1');
    expect((await loginDesde('198.51.100.1')).status).toBe(429);
    expect((await loginDesde('198.51.100.2')).status).toBe(400);
  });
});

describe('Rate limiting de /api/chat', () => {
  const chat = () => request(app).post('/api/chat').send({});

  test('permite 10 consultas por minuto y bloquea la 11.ª con HTTP 429', async () => {
    for (let i = 1; i <= 10; i++) {
      expect((await chat()).status).toBe(400); // faltan datos: el controlador responde sin llamar a Gemini
    }
    expect((await chat()).status).toBe(429);
    expect(await valorMetrica('chat')).toBe(1);
  });

  test('el bloqueo del login no bloquea el chat (contadores separados)', async () => {
    for (let i = 0; i < 6; i++) await loginInvalido();
    expect((await chat()).status).toBe(400);
  });
});

describe('crearLimitador: solo cuentan los intentos fallidos', () => {
  const { crearLimitador } = require('../src/middlewares/rateLimit.middleware');

  const appPrueba = () => {
    const mini = express();
    mini.use(express.json());
    mini.post('/entrar', crearLimitador({ ruta: 'prueba', limite: 2, ventanaMs: 60000, soloFallidos: true }), (req, res) => {
      res.status(req.body.ok ? 200 : 400).json({});
    });
    return mini;
  };

  test('los intentos correctos no consumen el límite', async () => {
    const mini = appPrueba();
    for (let i = 0; i < 6; i++) {
      expect((await request(mini).post('/entrar').send({ ok: true })).status).toBe(200);
    }
    expect((await request(mini).post('/entrar').send({ ok: false })).status).toBe(400);
    expect((await request(mini).post('/entrar').send({ ok: false })).status).toBe(400);
    expect((await request(mini).post('/entrar').send({ ok: false })).status).toBe(429);
  });
});
