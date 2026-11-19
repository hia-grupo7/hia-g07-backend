const fs = require('fs');
const os = require('os');
const path = require('path');
const { leerSecreto, limpiarCache } = require('../config/secrets');

describe('leerSecreto (Docker Secrets)', () => {
  let carpeta;
  const variables = ['PRUEBA_SECRETO', 'PRUEBA_SECRETO_FILE'];

  beforeEach(() => {
    carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'secretos-'));
    variables.forEach((v) => delete process.env[v]);
    limpiarCache();
  });

  afterEach(() => {
    fs.rmSync(carpeta, { recursive: true, force: true });
    variables.forEach((v) => delete process.env[v]);
    limpiarCache();
  });

  const crearArchivo = (contenido) => {
    const ruta = path.join(carpeta, 'secreto');
    fs.writeFileSync(ruta, contenido);
    return ruta;
  };

  test('lee el valor desde el archivo indicado en <NOMBRE>_FILE', () => {
    process.env.PRUEBA_SECRETO_FILE = crearArchivo('valor-del-archivo');
    expect(leerSecreto('PRUEBA_SECRETO')).toBe('valor-del-archivo');
  });

  test('el archivo tiene prioridad sobre la variable de entorno', () => {
    process.env.PRUEBA_SECRETO = 'valor-de-la-variable';
    process.env.PRUEBA_SECRETO_FILE = crearArchivo('valor-del-archivo');
    expect(leerSecreto('PRUEBA_SECRETO')).toBe('valor-del-archivo');
  });

  test('elimina espacios y saltos de línea al final del archivo', () => {
    process.env.PRUEBA_SECRETO_FILE = crearArchivo('valor\r\n');
    expect(leerSecreto('PRUEBA_SECRETO')).toBe('valor');
  });

  test('si el archivo está vacío usa la variable de entorno', () => {
    process.env.PRUEBA_SECRETO = 'valor-de-la-variable';
    process.env.PRUEBA_SECRETO_FILE = crearArchivo('');
    expect(leerSecreto('PRUEBA_SECRETO')).toBe('valor-de-la-variable');
  });

  test('si el archivo no existe usa la variable de entorno y avisa', () => {
    const aviso = jest.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.PRUEBA_SECRETO = 'valor-de-la-variable';
    process.env.PRUEBA_SECRETO_FILE = path.join(carpeta, 'no-existe');
    expect(leerSecreto('PRUEBA_SECRETO')).toBe('valor-de-la-variable');
    expect(aviso).toHaveBeenCalledTimes(1);
    aviso.mockRestore();
  });

  test('sin archivo ni variable devuelve undefined', () => {
    expect(leerSecreto('PRUEBA_SECRETO')).toBeUndefined();
  });

  test('sin archivo usa la variable de entorno (desarrollo sin Docker)', () => {
    process.env.PRUEBA_SECRETO = 'solo-variable';
    expect(leerSecreto('PRUEBA_SECRETO')).toBe('solo-variable');
  });

  test('guarda el valor en caché hasta que se limpia', () => {
    const ruta = crearArchivo('primero');
    process.env.PRUEBA_SECRETO_FILE = ruta;
    expect(leerSecreto('PRUEBA_SECRETO')).toBe('primero');
    fs.writeFileSync(ruta, 'segundo');
    expect(leerSecreto('PRUEBA_SECRETO')).toBe('primero');
    limpiarCache();
    expect(leerSecreto('PRUEBA_SECRETO')).toBe('segundo');
  });
});
