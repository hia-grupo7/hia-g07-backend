jest.mock('../config/database', () => require('./helpers/mockDatabase'));

const request = require('supertest');

// Cada prueba carga una copia nueva de la app: el control de avisos por IP vive en memoria.
let app;
let Auditoria;
let register;
let fetchFalso;

const esperarAvisos = () => new Promise((resolve) => setImmediate(resolve));

const valorMetrica = async () => {
  const texto = await register.metrics();
  const linea = texto.split('\n').find((l) => l.startsWith('rayuela_honeypot_hits_total'));
  return linea ? Number(linea.split(' ')[1]) : null;
};

beforeEach(() => {
  jest.resetModules();
  process.env.HONEYPOT_WEBHOOK_URL = 'http://n8n.test/webhook/honeypot-alerta';
  delete process.env.HONEYPOT_WEBHOOK_TOKEN;
  delete process.env.HONEYPOT_WEBHOOK_TOKEN_FILE;
  ({ register } = require('prom-client'));
  Auditoria = require('../src/models/auditoria.model');
  jest.spyOn(Auditoria, 'create').mockResolvedValue({ id: 42 });
  fetchFalso = jest.fn().mockResolvedValue({ ok: true, status: 200 });
  global.fetch = fetchFalso;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  app = require('../app');
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.HONEYPOT_WEBHOOK_URL;
});

describe('Endpoint honeypot /api/admin/reset-all', () => {
  test('responde como una ruta protegida (401) y no ejecuta ninguna accion real', async () => {
    const res = await request(app).post('/api/admin/reset-all');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ status: 0, msg: 'Acceso denegado. Token no proporcionado.' });
  });

  test.each(['get', 'post', 'put', 'delete', 'patch'])('registra el acceso con el metodo %s', async (metodo) => {
    const res = await request(app)[metodo]('/api/admin/reset-all');

    expect(res.status).toBe(401);
    expect(Auditoria.create).toHaveBeenCalledTimes(1);
    expect(JSON.parse(Auditoria.create.mock.calls[0][0].detalle).metodo).toBe(metodo.toUpperCase());
  });

  test('guarda en auditorias la IP, el User-Agent, la ruta y la fecha del visitante', async () => {
    await request(app)
      .post('/api/admin/reset-all?confirmar=si')
      .set('User-Agent', 'sqlmap/1.7')
      .set('X-Forwarded-For', '203.0.113.9');

    const fila = Auditoria.create.mock.calls[0][0];
    expect(fila).toMatchObject({ accion: 'HONEYPOT', tablaAfectada: 'honeypot', usuarioId: null });
    expect(fila.fecha).toBeInstanceOf(Date);
    const detalle = JSON.parse(fila.detalle);
    expect(detalle.userAgent).toBe('sqlmap/1.7');
    expect(detalle.ruta).toBe('/api/admin/reset-all?confirmar=si');
    expect(detalle.ip).toBeTruthy();
    expect(detalle.cadenaXForwardedFor).toBe('203.0.113.9');
  });

  test('no guarda el valor de Authorization ni de Cookie', async () => {
    await request(app)
      .post('/api/admin/reset-all')
      .set('Authorization', 'Bearer token-super-secreto')
      .set('Cookie', 'sesion=valor-secreto');

    const crudo = Auditoria.create.mock.calls[0][0].detalle;
    expect(crudo).not.toContain('token-super-secreto');
    expect(crudo).not.toContain('valor-secreto');
    const { cabeceras } = JSON.parse(crudo);
    expect(cabeceras.authorization).toMatch(/^\[presente/);
    expect(cabeceras.cookie).toMatch(/^\[presente/);
  });

  test('recorta las cabeceras muy largas', async () => {
    await request(app).post('/api/admin/reset-all').set('X-Relleno', 'a'.repeat(5000));

    const { cabeceras } = JSON.parse(Auditoria.create.mock.calls[0][0].detalle);
    expect(cabeceras['x-relleno'].length).toBeLessThan(250);
  });

  test('suma rayuela_honeypot_hits_total en cada acceso', async () => {
    expect(await valorMetrica()).toBe(0);
    await request(app).post('/api/admin/reset-all');
    await request(app).get('/api/admin/reset-all');
    expect(await valorMetrica()).toBe(2);
  });

  test('registra el 100% de los accesos aunque se avise a n8n una sola vez por IP', async () => {
    for (let i = 0; i < 4; i++) await request(app).post('/api/admin/reset-all');
    await esperarAvisos();

    expect(Auditoria.create).toHaveBeenCalledTimes(4);
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  test('el aviso a n8n lleva severidad alta, el id de auditoria y los datos del visitante', async () => {
    await request(app).post('/api/admin/reset-all').set('User-Agent', 'curl/8.0');
    await esperarAvisos();

    const [url, opciones] = fetchFalso.mock.calls[0];
    expect(url).toBe('http://n8n.test/webhook/honeypot-alerta');
    expect(opciones.method).toBe('POST');
    const cuerpo = JSON.parse(opciones.body);
    expect(cuerpo).toMatchObject({ evento: 'honeypot', severidad: 'alta', auditoriaId: 42, userAgent: 'curl/8.0' });
  });

  test('envia el token del webhook si esta configurado', async () => {
    process.env.HONEYPOT_WEBHOOK_TOKEN = 'token-de-prueba';
    jest.resetModules();
    jest.doMock('../config/database', () => require('./helpers/mockDatabase'));
    const Aud = require('../src/models/auditoria.model');
    jest.spyOn(Aud, 'create').mockResolvedValue({ id: 1 });
    const appNueva = require('../app');

    await request(appNueva).post('/api/admin/reset-all');
    await esperarAvisos();

    expect(fetchFalso.mock.calls[0][1].headers['X-Honeypot-Token']).toBe('token-de-prueba');
  });

  test('sin HONEYPOT_WEBHOOK_URL registra igual y no intenta avisar', async () => {
    delete process.env.HONEYPOT_WEBHOOK_URL;

    const res = await request(app).post('/api/admin/reset-all');
    await esperarAvisos();

    expect(res.status).toBe(401);
    expect(Auditoria.create).toHaveBeenCalledTimes(1);
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  test('si n8n no responde, la respuesta al visitante es la misma', async () => {
    fetchFalso.mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await request(app).post('/api/admin/reset-all');
    await esperarAvisos();

    expect(res.status).toBe(401);
    expect(res.body.msg).toBe('Acceso denegado. Token no proporcionado.');
  });

  test('si falla la base, igual responde 401 y avisa a n8n', async () => {
    Auditoria.create.mockRejectedValue(new Error('base caida'));

    const res = await request(app).post('/api/admin/reset-all');
    await esperarAvisos();

    expect(res.status).toBe(401);
    expect(fetchFalso).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchFalso.mock.calls[0][1].body).auditoriaId).toBeNull();
  });

  test('no afecta a las rutas reales de admin (siguen pidiendo token)', async () => {
    const res = await request(app).get('/api/admin/usuario');

    expect(res.status).toBe(401);
    expect(Auditoria.create).not.toHaveBeenCalled();
  });
});
