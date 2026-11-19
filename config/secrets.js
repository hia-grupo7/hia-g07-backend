const fs = require('fs');

// Docker Secrets (CARD-20 / SEC-01).
// Los secretos se montan como archivos en /run/secrets y el compose indica su ruta
// con una variable <NOMBRE>_FILE (por ejemplo JWT_SECRET_FILE=/run/secrets/jwt_secret).
// Así el valor no aparece en `docker inspect` ni en el repositorio.

const cache = new Map();

/**
 * Devuelve el valor de un secreto con esta prioridad:
 *   1. El archivo indicado por <NOMBRE>_FILE, si existe y no está vacío.
 *   2. La variable de entorno <NOMBRE> (desarrollo sin Docker y pruebas).
 * Un archivo vacío cuenta como "no configurado" (por ejemplo, claves de terceros pendientes).
 * Devuelve undefined si no hay ningún valor.
 */
function leerSecreto(nombre) {
  if (cache.has(nombre)) return cache.get(nombre);

  let valor;
  const ruta = process.env[`${nombre}_FILE`];
  if (ruta) {
    try {
      valor = fs.readFileSync(ruta, 'utf8').trim() || undefined;
    } catch (error) {
      console.warn(`No se pudo leer el secreto ${nombre} desde ${ruta} (${error.code || error.message}).`);
    }
  }
  if (valor === undefined) valor = process.env[nombre] || undefined;

  cache.set(nombre, valor);
  return valor;
}

// Solo para pruebas: fuerza a volver a leer los archivos.
function limpiarCache() {
  cache.clear();
}

module.exports = { leerSecreto, limpiarCache };
