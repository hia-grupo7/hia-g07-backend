#!/usr/bin/env node
/**
 * Rotación de secretos (CARD-20 / SEC-01).
 *
 * Cambiar solo el archivo de secrets/ NO alcanza: Postgres, Grafana y pgAdmin guardan su contraseña en su
 * volumen. Este script cambia la clave DENTRO del servicio, escribe el archivo nuevo, recrea los
 * contenedores que la usan y verifica que la nueva funcione y la anterior ya no. Si algo falla, revierte.
 *
 * Uso (igual en Windows, Linux y macOS; requiere Node 18+ y Docker):
 *   node scripts/rotate-secrets.js <secreto> [<secreto> ...]     rota los secretos indicados
 *   node scripts/rotate-secrets.js --todos                       db_password, replicator_password, jwt_secret,
 *                                                                grafana_admin_password y pgadmin_password
 *   node scripts/rotate-secrets.js --poner <secreto> --si        reemplaza una clave de terceros; el valor se lee
 *                                                                de la entrada estándar (o se escribe oculto)
 *   Opciones: --simular (muestra los pasos sin ejecutar)  --si (no pide confirmación)  --ayuda
 *
 * No rota los secretos de Mantis (mantis_*): el salt tiene que ser el mismo en todo el grupo.
 * Nunca imprime valores de secretos. El valor anterior se guarda en secrets/.anteriores/ para poder volver atrás.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { spawnSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..');
const DIR = path.join(RAIZ, 'secrets');
const PERFILES = ['--profile', 'blue', '--profile', 'green', '--profile', 'mantis'];
const PRIMARIO = 'rayuela-db-primary';
const CONTENEDOR = {
  'backend-blue': 'rayuela-backend-blue',
  'backend-green': 'rayuela-backend-green',
  backup: 'rayuela-backup',
  pgbouncer: 'rayuela-pgbouncer',
  postgres_exporter: 'rayuela-postgres-exporter',
  'postgres-replica': 'rayuela-db-replica',
};
const BACKENDS = ['backend-blue', 'backend-green'];
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const log = (m = '') => console.log(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const generar = (n) => Array.from({ length: n }, () => ALFABETO[crypto.randomInt(ALFABETO.length)]).join('');
const esAlfanumerico = (v) => /^[A-Za-z0-9]+$/.test(v);

// ---------------------------------------------------------------- Docker (sin shell: igual en cualquier sistema)
function docker(args, { input } = {}) {
  const r = spawnSync('docker', args, { cwd: RAIZ, encoding: 'utf8', input, windowsHide: true });
  if (r.error) throw new Error(`No se pudo ejecutar docker: ${r.error.message}`);
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}
const compose = (args) => docker(['compose', ...PERFILES, ...args]);
const corriendo = (c) => docker(['inspect', '-f', '{{.State.Running}}', c]).out === 'true';
const envDe = (c, nombre) => {
  const r = docker(['inspect', '-f', '{{range .Config.Env}}{{println .}}{{end}}', c]);
  const linea = r.out.split('\n').find((l) => l.startsWith(`${nombre}=`));
  return linea ? linea.slice(nombre.length + 1).trim() : undefined;
};
const puertoPublicado = (c, interno) => {
  const m = docker(['port', c, String(interno)]).out.split('\n')[0].match(/:(\d+)$/);
  return m ? Number(m[1]) : undefined;
};

// Las claves viajan por la entrada estándar, nunca como argumento (no quedan en la lista de procesos).
function sql(contenedor, usuario, consulta) {
  return docker(['exec', '-i', contenedor, 'psql', '-U', usuario, '-v', 'ON_ERROR_STOP=1', '-q', '-t', '-A'], { input: `${consulta}\n` });
}
function conClave(contenedor, host, puerto, usuario, clave, consulta) {
  const base = envDe(PRIMARIO, 'POSTGRES_DB') || 'postgres';
  return docker(
    ['exec', '-i', contenedor, 'sh', '-c', 'read -r PGPASSWORD; export PGPASSWORD; psql -h "$1" -p "$2" -U "$3" -d "$4" -tAc "$5"', 'sh', host, String(puerto), usuario, base, consulta],
    { input: `${clave}\n` }
  );
}
const usuarioBD = () => envDe(PRIMARIO, 'POSTGRES_USER') || 'postgres';

async function esperarBackend(contenedor, segundos = 120) {
  const limite = Date.now() + segundos * 1000;
  while (Date.now() < limite) {
    const r = docker(['exec', contenedor, 'wget', '-qO-', 'http://127.0.0.1:3000/api/health']);
    if (r.ok && r.out.includes('"status":"ok"')) return true;
    await sleep(3000);
  }
  return false;
}

// ---------------------------------------------------------------- Archivos de secretos
const archivo = (nombre) => path.join(DIR, nombre);
const leer = (nombre) => fs.readFileSync(archivo(nombre), 'utf8').trim();
// Se escribe sobre el mismo archivo (no se reemplaza): el montaje de Docker sigue apuntando a él.
const escribir = (nombre, valor) => fs.writeFileSync(archivo(nombre), valor, { mode: 0o644 });
function guardarAnterior(nombre, valor) {
  const carpeta = path.join(DIR, '.anteriores');
  fs.mkdirSync(carpeta, { recursive: true });
  const sello = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  fs.writeFileSync(path.join(carpeta, `${nombre}.${sello}`), valor, { mode: 0o600 });
}

// ---------------------------------------------------------------- Verificaciones auxiliares
const cookiesDe = (res) => {
  const lista = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
  return lista.map((c) => c.split(';')[0]).join('; ');
};
async function pgadminLogin(base, email, clave) {
  const r1 = await fetch(`${base}/login`, { redirect: 'manual' });
  const m = (await r1.text()).match(/"csrfToken":\s*"([^"]+)"/);
  const r2 = await fetch(`${base}/authenticate/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookiesDe(r1) },
    body: new URLSearchParams({ email, password: clave, csrf_token: m ? m[1] : '', language: 'en', internal_button: 'Login' }),
  });
  return r2.status === 302 && (r2.headers.get('location') || '').includes('/browser');
}
async function grafanaApi(base, usuario, clave, metodo, ruta, cuerpo) {
  const res = await fetch(base + ruta, {
    method: metodo,
    headers: { Authorization: `Basic ${Buffer.from(`${usuario}:${clave}`).toString('base64')}`, 'Content-Type': 'application/json' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return res.status;
}
const chequeo = (ok, texto) => ({ ok, texto });

// ---------------------------------------------------------------- Definición de cada secreto
function cambiarClaveBD(rol, clave) {
  if (!esAlfanumerico(clave)) throw new Error(`La clave de ${rol} tiene caracteres que no se pueden pasar de forma segura a SQL.`);
  const r = sql(PRIMARIO, usuarioBD(), `ALTER ROLE "${rol}" PASSWORD '${clave}';`);
  if (!r.ok) throw new Error(`No se pudo cambiar la clave de ${rol} en la base: ${r.err.split('\n')[0]}`);
}

const DEFS = {
  db_password: {
    largo: 24,
    requiere: [PRIMARIO],
    consumidores: ['postgres_exporter', 'pgbouncer', 'backup', ...BACKENDS],
    pasos: ['ALTER ROLE del usuario de la base dentro de rayuela-db-primary (la clave anterior deja de valer)', 'Se recrean los servicios que la usan', 'Se verifica: clave nueva acepta, la anterior se rechaza, PgBouncer, backup y backend funcionan'],
    async aplicar(nuevo) { cambiarClaveBD(usuarioBD(), nuevo); },
    async revertir(_nuevo, viejo) { cambiarClaveBD(usuarioBD(), viejo); },
    async verificar(nuevo, viejo) {
      const u = usuarioBD();
      const ip = docker(['exec', PRIMARIO, 'hostname', '-i']).out.split(' ')[0];
      const res = [];
      res.push(chequeo(conClave(PRIMARIO, ip, 5432, u, nuevo, 'select 1').out === '1', 'la base acepta la clave nueva'));
      res.push(chequeo(!conClave(PRIMARIO, ip, 5432, u, viejo, 'select 1').ok, 'la base rechaza la clave anterior'));
      if (corriendo(CONTENEDOR.pgbouncer)) res.push(chequeo(conClave(CONTENEDOR.pgbouncer, '127.0.0.1', 6432, u, nuevo, 'select 1').out === '1', 'PgBouncer conecta con la clave nueva'));
      if (corriendo(CONTENEDOR.backup)) res.push(chequeo(docker(['exec', CONTENEDOR.backup, 'sh', '/usr/local/bin/backup.sh']).out.includes('Backup OK'), 'el backup funciona con la clave nueva'));
      return res;
    },
  },
  replicator_password: {
    largo: 24,
    requiere: [PRIMARIO],
    consumidores: ['postgres-replica'],
    pasos: ['ALTER ROLE replicator dentro de rayuela-db-primary', 'Se recrea la réplica (vuelve a clonar con la clave nueva)', 'Se verifica que la replicación esté activa'],
    async aplicar(nuevo) {
      const existe = sql(PRIMARIO, usuarioBD(), "select count(*) from pg_roles where rolname='replicator'").out === '1';
      if (!existe) throw new Error('El rol replicator no existe en la base (falla conocida #2): no hay nada que rotar.');
      cambiarClaveBD('replicator', nuevo);
    },
    async revertir(_nuevo, viejo) { cambiarClaveBD('replicator', viejo); },
    async verificar(nuevo, viejo) {
      const u = usuarioBD();
      let n = '0';
      for (let i = 0; i < 40; i++) {
        n = sql(PRIMARIO, u, 'select count(*) from pg_stat_replication').out;
        if (n !== '0') break;
        await sleep(3000);
      }
      const ip = docker(['exec', PRIMARIO, 'hostname', '-i']).out.split(' ')[0];
      return [
        chequeo(n !== '0', 'la réplica clonó y replica con la clave nueva'),
        chequeo(!conClave(PRIMARIO, ip, 5432, 'replicator', viejo, 'select 1').ok, 'la base rechaza la clave anterior del rol replicator'),
      ];
    },
  },
  jwt_secret: {
    largo: 64,
    requiere: [],
    consumidores: BACKENDS,
    pasos: ['Se recrean los backends (leen el secreto al arrancar)', 'Los tokens emitidos con la clave anterior dejan de valer: se cierran las sesiones abiertas', 'Se verifica con un token firmado con cada clave'],
    async aplicar() {},
    async revertir() {},
    async verificar(nuevo, viejo) {
      let jwt;
      try { jwt = require('jsonwebtoken'); } catch { return [chequeo(true, '(omitido: jsonwebtoken no está instalado)')]; }
      const puerto = corriendo('rayuela-nginx-proxy') ? puertoPublicado('rayuela-nginx-proxy', 80) : undefined;
      if (!puerto) return [chequeo(true, '(omitido: nginx no está en ejecución)')];
      const id = Number(sql(PRIMARIO, usuarioBD(), 'select id from usuarios where estado order by id limit 1').out);
      const estado = async (clave) => {
        const t = jwt.sign({ id, email: 'rotacion@local', rol: 'admin' }, clave, { expiresIn: '60s' });
        return (await fetch(`http://127.0.0.1:${puerto}/api/auth/perfil`, { headers: { Authorization: `Bearer ${t}` } })).status;
      };
      return [chequeo((await estado(nuevo)) === 200, 'un token firmado con la clave nueva es aceptado'), chequeo((await estado(viejo)) === 403, 'un token firmado con la clave anterior es rechazado')];
    },
  },
  grafana_admin_password: {
    largo: 24,
    requiere: ['rayuela-grafana'],
    consumidores: [],
    pasos: ['Se cambia la clave del usuario admin con la API de Grafana', 'Se verifica: clave nueva entra, la anterior da 401'],
    async aplicar(nuevo, viejo) {
      const base = `http://127.0.0.1:${puertoPublicado('rayuela-grafana', 3000) || 3001}`;
      const usuario = envDe('rayuela-grafana', 'GF_SECURITY_ADMIN_USER') || 'admin';
      const st = await grafanaApi(base, usuario, viejo, 'PUT', '/api/admin/users/1/password', { password: nuevo });
      if (st !== 200) throw new Error(`Grafana respondió ${st} al cambiar la clave (¿la clave actual de secrets/ coincide con la de Grafana?).`);
    },
    async revertir(nuevo, viejo) {
      const base = `http://127.0.0.1:${puertoPublicado('rayuela-grafana', 3000) || 3001}`;
      await grafanaApi(base, envDe('rayuela-grafana', 'GF_SECURITY_ADMIN_USER') || 'admin', nuevo, 'PUT', '/api/admin/users/1/password', { password: viejo });
    },
    async verificar(nuevo, viejo) {
      const base = `http://127.0.0.1:${puertoPublicado('rayuela-grafana', 3000) || 3001}`;
      const usuario = envDe('rayuela-grafana', 'GF_SECURITY_ADMIN_USER') || 'admin';
      return [chequeo((await grafanaApi(base, usuario, nuevo, 'GET', '/api/org')) === 200, 'Grafana acepta la clave nueva'), chequeo((await grafanaApi(base, usuario, viejo, 'GET', '/api/org')) === 401, 'Grafana rechaza la clave anterior')];
    },
  },
  pgadmin_password: {
    largo: 24,
    requiere: ['rayuela-pgadmin'],
    consumidores: [],
    pasos: ['Se cambia la clave del usuario con el CLI de pgAdmin (conservando cuenta activa y rol Administrator)', 'Se verifica con un inicio de sesión web: la nueva entra, la anterior no'],
    async aplicar(nuevo) { cambiarPgadmin(nuevo); },
    async revertir(_nuevo, viejo) { cambiarPgadmin(viejo); },
    async verificar(nuevo, viejo) {
      const base = `http://127.0.0.1:${puertoPublicado('rayuela-pgadmin', 80) || 5050}`;
      const email = envDe('rayuela-pgadmin', 'PGADMIN_DEFAULT_EMAIL');
      // El intento fallido va primero: el correcto al final reinicia el contador de bloqueo de pgAdmin.
      const rechazada = !(await pgadminLogin(base, email, viejo));
      const aceptada = await pgadminLogin(base, email, nuevo);
      return [chequeo(aceptada, 'pgAdmin acepta la clave nueva'), chequeo(rechazada, 'pgAdmin rechaza la clave anterior')];
    },
  },
};

function cambiarPgadmin(clave) {
  const email = envDe('rayuela-pgadmin', 'PGADMIN_DEFAULT_EMAIL');
  if (!email) throw new Error('No se encontró PGADMIN_DEFAULT_EMAIL en el contenedor de pgAdmin.');
  // OJO: update-user deja la cuenta inactiva si no se indica --active: se fija explícitamente.
  const r = docker(
    ['exec', '-i', 'rayuela-pgadmin', 'sh', '-c', 'read -r P; exec /venv/bin/python /pgadmin4/setup.py update-user "$1" --password "$P" --active --role Administrator', 'sh', email],
    { input: `${clave}\n` }
  );
  if (!r.ok) throw new Error(`No se pudo cambiar la clave de pgAdmin: ${(r.err || r.out).split('\n').pop()}`);
}

// Claves de terceros: no se generan; el valor lo aporta el responsable del servicio.
for (const nombre of ['gemini_api_key', 'mercadopago_access_token', 'email_pass']) {
  DEFS[nombre] = {
    tercero: true,
    requiere: [],
    consumidores: BACKENDS,
    pasos: ['Se guarda el valor recibido en el archivo', 'Se recrean los backends para que lo lean', 'Se verifica que el contenedor vea el archivo con el valor nuevo'],
    async aplicar() {},
    async revertir() {},
    async verificar(nuevo, _viejo, nombre) {
      const c = BACKENDS.map((s) => CONTENEDOR[s]).find(corriendo);
      if (!c) return [chequeo(true, '(omitido: no hay backend en ejecución)')];
      const r = docker(['exec', c, 'sh', '-c', `wc -c < /run/secrets/${nombre}`]);
      return [chequeo(Number(r.out) === Buffer.byteLength(nuevo), 'el backend ve el valor nuevo en /run/secrets')];
    },
  };
}
const NOMBRES_ROTABLES = ['db_password', 'replicator_password', 'jwt_secret', 'grafana_admin_password', 'pgadmin_password'];
const NOMBRES_TERCEROS = ['gemini_api_key', 'mercadopago_access_token', 'email_pass'];

// ---------------------------------------------------------------- Entrada del usuario
function leerStdin() {
  return new Promise((resolve) => {
    let datos = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => (datos += d));
    process.stdin.on('end', () => resolve(datos));
  });
}
function preguntar(texto, oculto = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
    if (oculto && process.stdin.isTTY) rl._writeToOutput = (s) => { if (s.includes(texto)) rl.output.write(s); };
    rl.question(texto, (r) => { rl.close(); if (oculto) log(); resolve(r); });
  });
}

// ---------------------------------------------------------------- Ejecución
function ayuda() {
  const txt = fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 18).map((l) => l.replace(/^ ?\* ?/, '')).join('\n');
  log(txt);
}

function recrearConsumidores(defs) {
  const servicios = [...new Set(defs.flatMap((d) => d.consumidores))].filter((s) => corriendo(CONTENEDOR[s]));
  if (!servicios.length) return { servicios, ok: true };
  const r = compose(['up', '-d', '--force-recreate', '--no-deps', ...servicios]);
  return { servicios, ok: r.ok, err: r.err };
}
async function reiniciarProxyYEsperar(servicios) {
  const backends = servicios.filter((s) => BACKENDS.includes(s));
  if (!backends.length) return true;
  let sano = true;
  for (const s of backends) sano = (await esperarBackend(CONTENEDOR[s])) && sano;
  // nginx guarda la IP del backend: tras recrearlo hay que recargarlo (si no responde 502).
  if (corriendo('rayuela-nginx-proxy')) docker(['exec', 'rayuela-nginx-proxy', 'nginx', '-s', 'reload']);
  return sano;
}

async function revertirTodo(hechos, defs) {
  log('\nRevirtiendo los cambios...');
  for (const h of [...hechos].reverse()) {
    try { await h.def.revertir(h.nuevo, h.viejo); } catch (e) { log(`  [ERROR] no se pudo revertir ${h.nombre} dentro del servicio: ${e.message}`); }
    escribir(h.nombre, h.viejo);
    log(`  [OK] ${h.nombre}: archivo restaurado`);
  }
  const r = recrearConsumidores(defs);
  await reiniciarProxyYEsperar(r.servicios);
  log('Los valores anteriores quedaron restaurados. Revisá el estado con: docker compose ps');
}

async function ejecutar(nombres, { simular, si, valores }) {
  const defs = nombres.map((n) => ({ nombre: n, ...DEFS[n] }));
  const problemas = [];
  for (const d of defs) {
    if (!fs.existsSync(archivo(d.nombre))) problemas.push(`Falta secrets/${d.nombre}: ejecutá primero scripts/init-secrets.`);
    for (const c of d.requiere) if (!corriendo(c)) problemas.push(`${d.nombre}: el contenedor ${c} no está en ejecución.`);
  }
  const consumidores = [...new Set(defs.flatMap((d) => d.consumidores))].filter((s) => corriendo(CONTENEDOR[s]));

  log(simular ? 'SIMULACIÓN: no se cambia nada.\n' : 'Rotación de secretos\n');
  for (const d of defs) {
    log(`${d.nombre}`);
    d.pasos.forEach((p, i) => log(`  ${i + 1}. ${p}`));
  }
  log(`\nServicios que se recrean (los que están en ejecución): ${consumidores.length ? consumidores.join(', ') : 'ninguno'}`);
  log(`El valor anterior se guarda en secrets/.anteriores/ (se pierde si borrás la carpeta secrets/).`);
  if (problemas.length) { log('\nAvisos:'); problemas.forEach((p) => log(`  - ${p}`)); }
  if (simular) return 0;
  if (problemas.length) { log('\nNo se cambió nada.'); return 1; }

  if (!si) {
    if (!process.stdin.isTTY && Object.keys(valores).length) { log('\nCon --poner hay que indicar --si (la entrada estándar trae el valor).'); return 1; }
    const r = await preguntar('\nEscribí SI para continuar: ');
    if (r.trim() !== 'SI') { log('Cancelado. No se cambió nada.'); return 1; }
  }

  // Fase A: cambiar la clave dentro de cada servicio y escribir el archivo.
  const hechos = [];
  log('');
  try {
    for (const d of defs) {
      const viejo = leer(d.nombre);
      const nuevo = valores[d.nombre] !== undefined ? valores[d.nombre] : generar(d.largo);
      guardarAnterior(d.nombre, viejo);
      await d.aplicar(nuevo, viejo);
      escribir(d.nombre, nuevo);
      hechos.push({ nombre: d.nombre, def: d, viejo, nuevo });
      log(`[OK] ${d.nombre}: cambiado dentro del servicio y en secrets/${d.nombre}`);
    }
  } catch (e) {
    log(`[ERROR] ${e.message}`);
    await revertirTodo(hechos, defs);
    return 1;
  }

  // Fase B: recrear los consumidores para que lean el archivo nuevo.
  const rec = recrearConsumidores(defs);
  if (!rec.ok) { log(`[ERROR] No se pudieron recrear los servicios: ${rec.err}`); await revertirTodo(hechos, defs); return 1; }
  if (rec.servicios.length) log(`[OK] Servicios recreados: ${rec.servicios.join(', ')}`);
  if (!(await reiniciarProxyYEsperar(rec.servicios))) { log('[ERROR] El backend no volvió a estar sano a tiempo.'); await revertirTodo(hechos, defs); return 1; }

  // Fase C: verificar cada secreto.
  let fallo = false;
  for (const h of hechos) {
    log(`\nVerificación de ${h.nombre}:`);
    let resultados;
    try { resultados = await h.def.verificar(h.nuevo, h.viejo, h.nombre); } catch (e) { resultados = [chequeo(false, `error al verificar: ${e.message}`)]; }
    for (const r of resultados) { log(`  [${r.ok ? 'OK' : 'ERROR'}] ${r.texto}`); if (!r.ok) fallo = true; }
  }
  if (fallo) { await revertirTodo(hechos, defs); return 1; }

  log('\nRotación completa. Los valores nuevos están en secrets/ (no se muestran).');
  return 0;
}

async function main() {
  const args = process.argv.slice(2);
  const opciones = { simular: args.includes('--simular'), si: args.includes('--si'), valores: {} };
  const poner = args.includes('--poner');
  const nombres = args.filter((a) => !a.startsWith('-'));
  if (args.includes('--ayuda') || args.includes('-h') || (!nombres.length && !args.includes('--todos'))) { ayuda(); return args.includes('--ayuda') || args.includes('-h') ? 0 : 1; }

  // Una opción mal escrita no se ignora: con un "--simulate" el script rotaría de verdad.
  const conocidas = ['--simular', '--si', '--todos', '--poner', '--ayuda', '-h'];
  const raras = args.filter((a) => a.startsWith('-') && !conocidas.includes(a));
  if (raras.length) { log(`Opción desconocida: ${raras.join(', ')} (usá --ayuda). No se cambió nada.`); return 1; }
  if (args.includes('--todos') && nombres.length) { log('--todos no se combina con nombres de secretos. No se cambió nada.'); return 1; }
  const pedidos = args.includes('--todos') ? NOMBRES_ROTABLES : nombres;
  const mantis = pedidos.filter((n) => n.startsWith('mantis_'));
  if (mantis.length) { log(`Los secretos de Mantis no se rotan con este script (${mantis.join(', ')}): el salt debe ser el mismo en todo el grupo.`); return 1; }
  const desconocidos = pedidos.filter((n) => !DEFS[n]);
  if (desconocidos.length) { log(`Secreto desconocido: ${desconocidos.join(', ')}\nDisponibles: ${[...NOMBRES_ROTABLES, ...NOMBRES_TERCEROS].join(', ')}`); return 1; }
  const hayTerceros = pedidos.some((n) => DEFS[n].tercero);
  const todosTerceros = pedidos.every((n) => DEFS[n].tercero);
  if (poner && !todosTerceros) { log(`--poner solo sirve para claves de terceros: ${NOMBRES_TERCEROS.join(', ')}`); return 1; }
  if (!poner && hayTerceros) { log(`Las claves de terceros no se generan: usá --poner ${pedidos.filter((n) => DEFS[n].tercero).join(' ')}`); return 1; }
  if (poner) {
    if (pedidos.length !== 1) { log('--poner acepta un secreto por vez.'); return 1; }
    if (opciones.simular) return ejecutar(pedidos, opciones);
    const valor = (process.stdin.isTTY ? await preguntar(`Valor de ${pedidos[0]} (no se muestra): `, true) : await leerStdin()).trim();
    if (!valor) { log('El valor está vacío: no se cambió nada.'); return 1; }
    opciones.valores[pedidos[0]] = valor;
  }
  return ejecutar(pedidos, opciones);
}

main().then((c) => process.exit(c)).catch((e) => { console.error(`Error inesperado: ${e.message}`); process.exit(1); });
