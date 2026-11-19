#!/usr/bin/env node
/**
 * Crea la carpeta secrets/ con los archivos que el compose monta como Docker Secrets (CARD-20 / SEC-01).
 * Es el mismo comando en Windows, Linux y macOS (requiere Node 18+).
 *
 * Uso:
 *   node scripts/init-secrets.js                      instalación nueva: genera contraseñas aleatorias
 *   node scripts/init-secrets.js --valores-actuales   ya tenés volúmenes creados: conserva las contraseñas que
 *                                                     usaba el compose hasta ahora
 *   node scripts/init-secrets.js --nuevos             genera valores nuevos aunque existan volúmenes (la base
 *                                                     existente dejará de aceptar la clave)
 *   Opciones: --dir <carpeta>  --env <archivo .env>  --ayuda
 *
 * Reglas:
 *   - NUNCA pisa un archivo que ya existe (se puede volver a ejecutar sin riesgo).
 *   - Si el .env tiene el valor de un secreto (por ejemplo DB_PASSWORD), se usa ese valor.
 *   - Las claves de terceros (Gemini, Mercado Pago, correo) quedan vacías: se piden al responsable.
 *   - Se niega a continuar si ya existe el volumen de Postgres (código 2) o el de Mantis sin poder recuperar sus
 *     claves (código 3), porque una clave nueva dejaría esos servicios sin acceso a su base.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..');
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const log = (m = '') => console.log(m);
const err = (m) => console.error(m);

const AYUDA = `Crea la carpeta secrets/ con los archivos que el compose monta como Docker Secrets.

Uso:
  node scripts/init-secrets.js                      instalación nueva: genera contraseñas aleatorias
  node scripts/init-secrets.js --valores-actuales   ya tenés volúmenes creados: conserva las contraseñas anteriores
  node scripts/init-secrets.js --nuevos             valores nuevos aunque existan volúmenes (la base existente dejará de aceptar la clave)
  Opciones: --dir <carpeta>  --env <archivo .env>  --ayuda

Nunca pisa un archivo existente y toma el valor del .env si la variable está definida.
Se niega a continuar (código 2) si existe el volumen de Postgres sin --valores-actuales, y (código 3) si existe el de
Mantis y faltan sus claves.`;

// ---------------------------------------------------------------- Argumentos (una opción mal escrita no se ignora)
function leerArgumentos(argv) {
  const o = { actuales: false, nuevos: false, dir: path.join(RAIZ, 'secrets'), env: path.join(RAIZ, '.env'), ayuda: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--valores-actuales') o.actuales = true;
    else if (a === '--nuevos') o.nuevos = true;
    else if (a === '--ayuda' || a === '-h') o.ayuda = true;
    else if (a === '--dir' || a === '--env') {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`${a} necesita un valor.`);
      o[a.slice(2)] = path.resolve(argv[++i]);
    } else throw new Error(`Opción desconocida: ${a} (usá --ayuda).`);
  }
  return o;
}

// ---------------------------------------------------------------- Utilidades
const generar = (n) => Array.from({ length: n }, () => ALFABETO[crypto.randomInt(ALFABETO.length)]).join('');

function volumenExiste(nombre) {
  const r = spawnSync('docker', ['volume', 'inspect', nombre], { encoding: 'utf8', windowsHide: true });
  return !r.error && r.status === 0; // sin Docker instalado no hay volúmenes que proteger
}

function leerEnv(archivo, variable) {
  if (!fs.existsSync(archivo)) return '';
  for (const linea of fs.readFileSync(archivo, 'utf8').split('\n')) {
    const m = linea.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && m[1] === variable) return m[2].replace(/\r$/, '').replace(/^["']/, '').replace(/["']$/, '');
  }
  return '';
}

// ---------------------------------------------------------------- Definición de los secretos
// "anterior": contraseña que usaba el compose hasta ahora. Solo se usa con --valores-actuales, para quienes ya
// tienen volúmenes creados; se eliminará de este script cuando el grupo rote las contraseñas.
const SECRETOS = [
  { nombre: 'db_password', vars: ['DB_PASSWORD'], tipo: 'infra', anterior: 'admin123', largo: 24 },
  { nombre: 'replicator_password', vars: ['REPLICATOR_PASSWORD'], tipo: 'infra', anterior: 'replicator123', largo: 24 },
  { nombre: 'jwt_secret', vars: ['JWT_SECRET'], tipo: 'infra', anterior: 'MiClaveSecretaSuperDificilDeAdivinarRayuela123!', largo: 64 },
  { nombre: 'pgadmin_password', vars: ['PGADMIN_DEFAULT_PASSWORD'], tipo: 'infra', anterior: 'pgadmin_rayuela_2024', largo: 24 },
  { nombre: 'grafana_admin_password', vars: ['GRAFANA_ADMIN_PASSWORD'], tipo: 'infra', anterior: 'admin123', largo: 24 },
  { nombre: 'mantis_db_password', vars: ['MANTIS_DB_PASSWORD'], tipo: 'infra', anterior: '', largo: 32, mantis: true },
  { nombre: 'mantis_db_root_password', vars: ['MANTIS_DB_ROOT_PASSWORD'], tipo: 'infra', anterior: '', largo: 32, mantis: true },
  { nombre: 'mantis_crypto_salt', vars: ['MANTIS_CRYPTO_SALT'], tipo: 'infra', anterior: '', largo: 64, mantis: true },
  { nombre: 'gemini_api_key', vars: ['GEMINI_API_KEY'], tipo: 'tercero' },
  { nombre: 'mercadopago_access_token', vars: ['MERCADOPAGO_ACCESS_TOKEN', 'ACCESS_TOKEN'], tipo: 'tercero' },
  { nombre: 'email_pass', vars: ['EMAIL_PASS'], tipo: 'tercero' },
];

function main() {
  const o = leerArgumentos(process.argv.slice(2));
  if (o.ayuda) { log(AYUDA); return 0; }

  const valorDelEnv = (s) => {
    for (const v of s.vars) { const x = leerEnv(o.env, v); if (x) return { valor: x, origen: `.env (${v})` }; }
    return null;
  };

  // Protección 1: con volúmenes ya creados, una contraseña nueva rompería el acceso a la base.
  if (!o.actuales && !o.nuevos && volumenExiste('rayuela_postgres_data')) {
    err(`Ya existe el volumen rayuela_postgres_data: tu base fue creada con las contraseñas anteriores.
Generar valores nuevos haría que el backend no pueda conectarse a esa base.
  - Para conservar tus contraseñas actuales:   node scripts/init-secrets.js --valores-actuales
  - Para forzar valores nuevos (sabiendo que hay que rotarlos dentro de los servicios):  node scripts/init-secrets.js --nuevos`);
    return 2;
  }

  // Protección 2: las claves de Mantis no tienen un valor anterior que reconstruir.
  if (!o.nuevos && volumenExiste('rayuela_mantis_db_data')) {
    const faltan = SECRETOS.filter((s) => s.mantis && !fs.existsSync(path.join(o.dir, s.nombre)) && !valorDelEnv(s)).map((s) => s.nombre);
    if (faltan.length) {
      err(`Ya existe el volumen rayuela_mantis_db_data (Mantis tiene datos) y faltan claves que no se pueden reconstruir:
  ${faltan.join(' ')}
Si se generaran al azar, Mantis dejaría de poder conectarse a su base. Recuperalas con alguna de estas opciones:
  - desde una copia cifrada:   node scripts/backup-secrets.js restaurar <archivo.enc>
  - desde un .env que las tenga:  node scripts/init-secrets.js --valores-actuales --env <archivo>
  - si Mantis no tiene datos que conservar, forzá valores nuevos con --nuevos`);
      return 3;
    }
  }

  fs.mkdirSync(o.dir, { recursive: true });
  try { fs.chmodSync(o.dir, 0o755); } catch { /* Windows: no aplica */ }

  log(`Carpeta de secretos: ${o.dir}`);
  let creados = 0;
  let existentes = 0;
  const vacios = [];
  for (const s of SECRETOS) {
    const archivo = path.join(o.dir, s.nombre);
    if (fs.existsSync(archivo)) {
      log(`  = ${s.nombre.padEnd(26)} ya existe, no se modifica`);
      existentes++;
      continue;
    }
    let valor = '';
    let origen;
    const delEnv = valorDelEnv(s);
    if (delEnv) ({ valor, origen } = delEnv);
    else if (s.tipo === 'tercero') { origen = 'vacío: falta la clave real'; vacios.push(s.nombre); }
    else if (o.actuales && s.anterior) { valor = s.anterior; origen = 'valor anterior del compose'; }
    else { valor = generar(s.largo); origen = 'generado al azar'; }
    // Sin salto de línea final y con permisos de lectura: algunos contenedores no corren como root.
    fs.writeFileSync(archivo, valor, { mode: 0o644 });
    log(`  + ${s.nombre.padEnd(26)} creado (${origen})`);
    creados++;
  }

  log(`\nListo: ${creados} creado(s), ${existentes} ya existían.`);
  if (vacios.length) {
    log(`Faltan las claves reales de: ${vacios.join(' ')}`);
    log('  (se piden al responsable del servicio y se pegan en esos archivos; mientras tanto el');
    log('   chat con IA, los cobros con Mercado Pago y el envío de correos quedan deshabilitados).');
  }
  log(`
Accesos locales (las contraseñas están en los archivos de secrets/):
  Grafana  http://localhost:3001   usuario: admin    clave: secrets/grafana_admin_password
  pgAdmin  http://localhost:5050   correo: admin@rayuela.com   clave: secrets/pgadmin_password
  Postgres usuario: postgres       clave: secrets/db_password

Siguiente paso:  docker compose --profile blue up -d`);
  return 0;
}

try {
  process.exit(main());
} catch (e) {
  err(`Error: ${e.message}`);
  process.exit(1);
}
