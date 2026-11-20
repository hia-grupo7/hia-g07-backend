jest.mock('../config/database', () => require('./helpers/mockDatabase'));

const request = require('supertest');
const app = require('../app');
const Book = require('../src/models/book.model');

describe('/api/libros', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('GET devuelve 200 con la lista de libros', async () => {
    const libros = [
      { id: 1, titulo: 'Rayuela', autor: 'Julio Cortazar' },
      { id: 2, titulo: 'El Aleph', autor: 'Jorge Luis Borges' },
    ];
    jest.spyOn(Book, 'findAll').mockResolvedValue(libros);

    const res = await request(app).get('/api/libros');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(libros);
  });

  test('GET devuelve 500 si falla la consulta a la base de datos', async () => {
    jest.spyOn(Book, 'findAll').mockRejectedValue(new Error('fallo de BD'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app).get('/api/libros');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Error al obtener los libros');
  });

  test('POST sin token es rechazado con 401', async () => {
    const res = await request(app).post('/api/libros').send({ titulo: 'Libro nuevo' });

    expect(res.status).toBe(401);
  });

  test('POST con token invalido es rechazado con 403', async () => {
    const res = await request(app)
      .post('/api/libros')
      .set('Authorization', 'Bearer token-invalido')
      .send({ titulo: 'Libro nuevo' });

    expect(res.status).toBe(403);
  });
});
