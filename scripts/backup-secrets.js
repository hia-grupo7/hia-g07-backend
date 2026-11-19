#!/usr/bin/env node
/**
 * Copia de seguridad CIFRADA de la carpeta secrets/ (CARD-20 / SEC-01).
 *
 * Si se borra secrets/ por error, las claves de Mantis y las de terceros no se pueden regenerar:
 * esta copia las conserva fuera del repositorio.
 *
 * Uso (igual en Windows, Linux y macOS; requiere Node 18+):
 *   node scripts/backup-secrets.js respaldar <archivo.enc>             crea la copia (pide una contraseña)
 *   node scripts/backup-secrets.js restaurar <archivo.enc> [--pisar]   restaura; sin --pisar no toca archivos existentes
 *   Opción: --dir <carpeta>   usa otra carpeta en lugar de secrets/
 *   La contraseña también puede venir de la variable SECRETS_BACKUP_PASSPHRASE (para automatizar).
 *
 * Formato: JSON con AES-256-GCM y clave derivada con scrypt. No es un .zip: se abre con este mismo script.
 * Se niega a guardar la copia dentro del repositorio. Guardala en un gestor de contraseñas o un disco aparte.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const RAIZ = path.resolve(__dirname, '..');
const FORMATO = 'rayuela-secrets-v1';
const log = (m = '') => console.log(m);

function derivar(clave, sal) {
  return crypto.scryptSync(clave, sal, 32, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
}

function preguntarOculto(texto) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
    if (process.stdin.isTTY) rl._writeToOutput = (s) => { if (s.includes(texto)) rl.output.write(s); };
    rl.question(texto, (r) => { rl.close(); log(); resolve(r); });
  });
}

async function obtenerClave(confirmar) {
  if (process.env.SECRETS_BACKUP_PASSPHRASE) return process.env.SECRETS_BACKUP_PASSPHRASE;
  if (!process.stdin.isTTY) throw new Error('No hay una terminal para pedir la contraseña: definí SECRETS_BACKUP_PASSPHRASE.');
  const clave = await preguntarOculto('Contraseña de la copia: ');
  if (clave.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
  if (confirmar && (await preguntarOculto('Repetila: ')) !== clave) throw new Error('Las contraseñas no coinciden.');
  return clave;
}

function respaldar(destino, dir, clave) {
  const salida = path.resolve(destino);
  const relativa = path.relative(RAIZ, salida);
  if (!relativa.startsWith('..') && !path.isAbsolute(relativa)) {
    throw new Error('Por seguridad la copia no puede guardarse dentro del repositorio. Elegí una ruta fuera de hia-g07-backend.');
  }
  if (fs.existsSync(salida)) throw new Error(`Ya existe ${salida}: no se sobrescribe.`);
  const archivos = {};
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isFile()) archivos[e.name] = fs.readFileSync(path.join(dir, e.name)).toString('base64');
  }
  if (!Object.keys(archivos).length) throw new Error(`No hay archivos en ${dir}.`);
  const sal = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cifrador = crypto.createCipheriv('aes-256-gcm', derivar(clave, sal), iv);
  const datos = Buffer.concat([cifrador.update(JSON.stringify({ archivos }), 'utf8'), cifrador.final()]);
  const paquete = { formato: FORMATO, kdf: 'scrypt', sal: sal.toString('base64'), iv: iv.toString('base64'), tag: cifrador.getAuthTag().toString('base64'), datos: datos.toString('base64') };
  fs.writeFileSync(salida, JSON.stringify(paquete), { mode: 0o600 });
  log(`Copia creada: ${salida}`);
  log(`Archivos incluidos (${Object.keys(archivos).length}): ${Object.keys(archivos).join(', ')}`);
}

function restaurar(origen, dir, clave, pisar) {
  const paquete = JSON.parse(fs.readFileSync(path.resolve(origen), 'utf8'));
  if (paquete.formato !== FORMATO) throw new Error('El archivo no es una copia de secretos válida.');
  const descifrador = crypto.createDecipheriv('aes-256-gcm', derivar(clave, Buffer.from(paquete.sal, 'base64')), Buffer.from(paquete.iv, 'base64'));
  descifrador.setAuthTag(Buffer.from(paquete.tag, 'base64'));
  let contenido;
  try {
    contenido = JSON.parse(Buffer.concat([descifrador.update(Buffer.from(paquete.datos, 'base64')), descifrador.final()]).toString('utf8'));
  } catch {
    throw new Error('Contraseña incorrecta o archivo dañado: no se restauró nada.');
  }
  fs.mkdirSync(dir, { recursive: true });
  let escritos = 0;
  for (const [nombre, b64] of Object.entries(contenido.archivos)) {
    if (nombre !== path.basename(nombre)) continue; // nunca salir de la carpeta
    const destino = path.join(dir, nombre);
    if (fs.existsSync(destino) && !pisar) { log(`  = ${nombre}: ya existe, no se modifica (usá --pisar)`); continue; }
    fs.writeFileSync(destino, Buffer.from(b64, 'base64'), { mode: 0o644 });
    log(`  + ${nombre}: restaurado`);
    escritos++;
  }
  log(`Listo: ${escritos} archivo(s) restaurado(s) en ${dir}.`);
}

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--dir');
  const dir = i >= 0 ? path.resolve(args[i + 1] || '') : path.join(RAIZ, 'secrets');
  const pisar = args.includes('--pisar');
  const resto = args.filter((a, k) => !a.startsWith('--') && args[k - 1] !== '--dir');
  const [orden, archivo] = resto;
  if (!['respaldar', 'restaurar'].includes(orden) || !archivo) {
    log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 17).map((l) => l.replace(/^ ?\* ?/, '')).join('\n'));
    return orden ? 1 : 0;
  }
  const clave = await obtenerClave(orden === 'respaldar');
  if (orden === 'respaldar') respaldar(archivo, dir, clave);
  else restaurar(archivo, dir, clave, pisar);
  return 0;
}

main().then((c) => process.exit(c)).catch((e) => { console.error(`Error: ${e.message}`); process.exit(1); });
