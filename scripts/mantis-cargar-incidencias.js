#!/usr/bin/env node
/**
 * Carga en MantisBT las incidencias de docs/mantis/incidencias.json (CARD-19 / MAN-01).
 *
 * Uso:   node scripts/mantis-cargar-incidencias.js
 * Variables (de .env o del entorno):
 *   MANTIS_API_TOKEN   token de API de un usuario con permisos de gestión (se crea en Mi cuenta > Tokens API)
 *   MANTIS_PROJECT_ID  id del proyecto "Rayuela Marketplace" (por defecto 1)
 *   MANTIS_URL         URL base de Mantis (por defecto http://localhost:8081)
 *
 * Es idempotente: si ya existe una incidencia con el mismo resumen, la omite.
 * Requiere Node 18 o superior (usa fetch).
 */
const fs = require('fs');
const path = require('path');

function leerEnv() {
  const ruta = path.join(__dirname, '..', '.env');
  const out = {};
  if (fs.existsSync(ruta)) {
    for (const linea of fs.readFileSync(ruta, 'utf8').split(/\r?\n/)) {
      const i = linea.indexOf('=');
      if (i > 0 && !linea.trim().startsWith('#')) out[linea.slice(0, i).trim()] = linea.slice(i + 1).trim();
    }
  }
  return { ...out, ...process.env };
}

const env = leerEnv();
const BASE = `${env.MANTIS_URL || 'http://localhost:8081'}/api/rest`;
const PROYECTO = Number(env.MANTIS_PROJECT_ID || 1);
const TOKEN = env.MANTIS_API_TOKEN;

if (!TOKEN) {
  console.error('Falta MANTIS_API_TOKEN (variable de entorno o .env).');
  process.exit(1);
}

async function api(metodo, ruta, cuerpo) {
  const r = await fetch(BASE + ruta, {
    method: metodo,
    headers: { Authorization: TOKEN, 'Content-Type': 'application/json; charset=utf-8' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await r.text();
  let datos;
  try { datos = JSON.parse(texto); } catch { datos = texto; }
  if (!r.ok) throw new Error(`${metodo} ${ruta} -> ${r.status} ${typeof datos === 'string' ? datos.slice(0, 200) : JSON.stringify(datos)}`);
  return datos;
}

async function main() {
  const incidencias = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'mantis', 'incidencias.json'), 'utf8'));
  const existentes = await api('GET', `/issues?project_id=${PROYECTO}&page_size=200`);
  const resumenes = new Set((existentes.issues || []).map((i) => i.summary));

  for (const inc of incidencias) {
    if (resumenes.has(inc.resumen)) {
      console.log(`= ${inc.clave} ya existe, se omite`);
      continue;
    }
    const creada = await api('POST', '/issues', {
      summary: inc.resumen,
      description: inc.descripcion,
      steps_to_reproduce: inc.pasos,
      additional_information: inc.adicional,
      category: { name: inc.categoria },
      project: { id: PROYECTO },
      priority: { name: inc.prioridad },
      severity: { name: inc.severidad },
      reproducibility: { name: inc.reproducibilidad },
      handler: { name: inc.asignado },
    });
    const id = (creada.issue || creada).id;
    let estado = 'asignada';

    if (inc.estado === 'closed') {
      await api('POST', `/issues/${id}/notes`, { text: inc.nota, view_state: { name: 'public' } });
      await api('PATCH', `/issues/${id}`, { status: { name: 'resolved' }, resolution: { name: inc.resolucion } });
      await api('PATCH', `/issues/${id}`, { status: { name: 'closed' } });
      estado = 'cerrada';
    }
    console.log(`+ ${inc.clave} -> #${id} (${inc.categoria}, ${estado}, ${inc.asignado})`);
  }
}

main().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
