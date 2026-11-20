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
 *   - Se niega a continuar si ya existe el volumen de Postgres (código 2), el de Mantis (código 3) o el de la base de
 *     Nextcloud (código 4) sin poder recuperar sus claves, porque una clave nueva dejaría esos servicios sin acceso.
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
Se niega a continuar (código 2) si existe el volumen de Postgres sin --valores-actuales, y (código 3 y 4) si existe el
de Mantis o el de la base de Nextcloud y faltan sus claves.`;

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

// Docker Compose no falla cuando falta el archivo de un secreto: avisa y crea una CARPETA vacía con ese nombre.
// Por eso "existe" no alcanza: hay que distinguir un archivo de una carpeta.
function estadoRuta(ruta) {
  try { return fs.statSync(ruta).isDirectory() ? 'carpeta' : 'archivo'; } catch { return 'nada'; }
}

function leerEnv(archivo, variable) {
  if (!fs.existsSync(archivo)) return '';
  for (const linea of fs.readFileSync(archivo, 'utf8').split('\n')) {
    const m = linea.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && m[1] === variable) return m[2].replace(/\r$/, '').replace(/^["']/, '').replace(/["']$/, '');
  }
  return '';
}

// Valor guardado por versiones anteriores en otra ruta (sin saltos de línea finales), o null si no hay.
function valorLegado(s) {
  for (const rel of s.legado || []) {
    const ruta = path.join(RAIZ, rel);
    if (estadoRuta(ruta) === 'archivo') {
      const v = fs.readFileSync(ruta, 'utf8').trimEnd();
      if (v) return { valor: v, origen: `valor existente en ${rel}` };
    }
  }
  return null;
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
  { nombre: 'honeypot_webhook_token', vars: ['HONEYPOT_WEBHOOK_TOKEN'], tipo: 'infra', anterior: '', largo: 48 },
  // Alta disponibilidad (CARD-08): usuario de monitoreo de los exportadores; se genera al azar, no tiene valor anterior.
  { nombre: 'monitor_password', vars: ['MONITOR_PASSWORD'], tipo: 'infra', anterior: '', largo: 24 },
  // Diagnostico con IA (n8n + Qdrant): clave de Qdrant y token del webhook; se generan al azar.
  { nombre: 'qdrant_api_key', vars: ['QDRANT_API_KEY'], tipo: 'infra', anterior: '', largo: 48 },
  { nombre: 'diagnostico_webhook_token', vars: ['DIAGNOSTICO_WEBHOOK_TOKEN'], tipo: 'infra', anterior: '', largo: 48 },
  { nombre: 'mantis_db_password', vars: ['MANTIS_DB_PASSWORD'], tipo: 'infra', anterior: '', largo: 32, mantis: true },
  { nombre: 'mantis_db_root_password', vars: ['MANTIS_DB_ROOT_PASSWORD'], tipo: 'infra', anterior: '', largo: 32, mantis: true },
  { nombre: 'mantis_crypto_salt', vars: ['MANTIS_CRYPTO_SALT'], tipo: 'infra', anterior: '', largo: 64, mantis: true },
  // Nextcloud (CARD-16): su compose vive aparte (nextcloud/compose.nextcloud.yaml) y lee estos mismos archivos.
  // "legado": rutas (relativas a la raíz del repo) donde versiones anteriores guardaban el valor; si existen, se reutilizan.
  // "volumen": base ya creada con esa contraseña; si existe y no se puede recuperar el valor, no se genera uno nuevo.
  { nombre: 'nc_db_password', vars: ['NC_DB_PASSWORD'], tipo: 'infra', anterior: '', largo: 32, volumen: 'rayuela-nextcloud_nextcloud_db_data',
    legado: ['nextcloud/secrets/nc_db_password.txt', 'secrets/nc_db_password.txt'] },
  { nombre: 'nc_admin_password', vars: ['NC_ADMIN_PASSWORD'], tipo: 'infra', anterior: '', largo: 24,
    legado: ['nextcloud/secrets/nc_admin_password.txt', 'secrets/nc_admin_password.txt'] },
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
    const faltan = SECRETOS.filter((s) => s.mantis && estadoRuta(path.join(o.dir, s.nombre)) !== 'archivo' && !valorDelEnv(s)).map((s) => s.nombre);
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

  // Protección 3: la base de Nextcloud ya creada guarda su contraseña; una nueva la dejaría inaccesible.
  if (!o.nuevos) {
    const faltan = SECRETOS.filter((s) => s.volumen && volumenExiste(s.volumen)
      && estadoRuta(path.join(o.dir, s.nombre)) !== 'archivo' && !valorDelEnv(s) && !valorLegado(s)).map((s) => s.nombre);
    if (faltan.length) {
      err(`Ya existe el volumen de la base de Nextcloud y falta su contraseña, que no se puede reconstruir:
  ${faltan.join(' ')}
Si se generara al azar, Nextcloud dejaría de poder conectarse a su base. Recuperala con alguna de estas opciones:
  - desde una copia cifrada:   node scripts/backup-secrets.js restaurar <archivo.enc>
  - copiando el archivo que usabas (nextcloud/secrets/nc_db_password.txt) o definiendo NC_DB_PASSWORD en el .env
  - si Nextcloud no tiene datos que conservar, forzá valores nuevos con --nuevos`);
      return 4;
    }
  }

  const conContenido = SECRETOS.map((s) => path.join(o.dir, s.nombre))
    .filter((p) => estadoRuta(p) === 'carpeta' && fs.readdirSync(p).length > 0);
  if (conContenido.length) {
    err(`Estas rutas son carpetas con contenido (deberían ser archivos de secretos): no se cambió nada.
  ${conContenido.join('\n  ')}
Revisalas y borralas a mano antes de volver a ejecutar el script.`);
    return 1;
  }

  fs.mkdirSync(o.dir, { recursive: true });
  try { fs.chmodSync(o.dir, 0o755); } catch { /* Windows: no aplica */ }

  log(`Carpeta de secretos: ${o.dir}`);
  let creados = 0;
  let existentes = 0;
  const vacios = [];
  for (const s of SECRETOS) {
    const archivo = path.join(o.dir, s.nombre);
    const estado = estadoRuta(archivo);
    if (estado === 'archivo') {
      log(`  = ${s.nombre.padEnd(26)} ya existe, no se modifica`);
      existentes++;
      continue;
    }
    let valor = '';
    let origen;
    const delEnv = valorDelEnv(s);
    const delLegado = valorLegado(s);
    if (delEnv) ({ valor, origen } = delEnv);
    else if (delLegado) ({ valor, origen } = delLegado);
    else if (s.tipo === 'tercero') { origen = 'vacío: falta la clave real'; vacios.push(s.nombre); }
    else if (o.actuales && s.anterior) { valor = s.anterior; origen = 'valor anterior del compose'; }
    else { valor = generar(s.largo); origen = 'generado al azar'; }
    // Una carpeta vacía en lugar del archivo es lo que deja Docker Compose si se hizo "up" antes de crear los secretos.
    if (estado === 'carpeta') { fs.rmdirSync(archivo); origen += '; reemplaza una carpeta vacía que creó Docker'; }
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

Siguiente paso:  docker compose --profile blue up -d
Nextcloud (opcional, necesita el paso anterior porque la red integracion-net la crea el stack principal):
  docker compose --env-file .env -f nextcloud/compose.nextcloud.yaml up -d   (usuario: valor de NC_ADMIN_USER, clave: secrets/nc_admin_password)`);
  return 0;
}

try {
  process.exit(main());
} catch (e) {
  err(`Error: ${e.message}`);
  process.exit(1);
}
