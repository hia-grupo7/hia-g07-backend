const Auditoria = require('../models/auditoria.model');
const { rayuelaHoneypotHits } = require('../metrics');
const { leerSecreto } = require('../../config/secrets');

// Endpoint trampa /api/admin/reset-all (CARD-21 / SEC-02).
// No existe ninguna funcion real detras: nadie legitimo lo llama. Cualquier acceso es sospechoso, asi que
//   1. se registra en la tabla auditorias (IP, User-Agent, metodo, ruta, cabeceras y fecha),
//   2. se suma a la metrica rayuela_honeypot_hits_total,
//   3. se avisa a n8n por webhook para que abra un incidente critico en MantisBT,
//   4. se responde igual que una ruta protegida (401), sin revelar que es una trampa ni ejecutar nada.

const VENTANA_AVISO_MS = parseInt(process.env.HONEYPOT_VENTANA_MS, 10) || 10 * 60 * 1000;
const TIMEOUT_WEBHOOK_MS = 3000;
const MAX_VALOR_CABECERA = 200;
const MAX_ORIGENES_AVISADOS = 1000;

// Cabeceras cuyo valor no se guarda: solo se deja constancia de que venian y cuanto median.
const CABECERAS_SENSIBLES = new Set(['authorization', 'cookie', 'proxy-authorization', 'x-api-key']);

// IP -> instante del ultimo aviso a n8n. El registro en auditorias es del 100% de los accesos;
// el aviso (y por lo tanto el ticket) se limita a uno por IP y ventana para que un atacante
// o un escaner no inunden MantisBT. Vive en memoria por instancia (igual que el rate limit).
const ultimoAviso = new Map();

const recortar = (valor) => {
    const texto = Array.isArray(valor) ? valor.join(', ') : String(valor);
    return texto.length > MAX_VALOR_CABECERA ? `${texto.slice(0, MAX_VALOR_CABECERA)}...` : texto;
};

function cabecerasSeguras(headers) {
    const salida = {};
    for (const [nombre, valor] of Object.entries(headers || {})) {
        salida[nombre] = CABECERAS_SENSIBLES.has(nombre.toLowerCase())
            ? `[presente, ${String(valor).length} caracteres]`
            : recortar(valor);
    }
    return salida;
}

function describirAcceso(req) {
    return {
        ip: req.ip,
        cadenaXForwardedFor: req.headers['x-forwarded-for'] || null,
        userAgent: req.headers['user-agent'] || null,
        metodo: req.method,
        ruta: req.originalUrl,
        cabeceras: cabecerasSeguras(req.headers),
        fecha: new Date().toISOString()
    };
}

function correspondeAvisar(ip) {
    const ahora = Date.now();
    const previo = ultimoAviso.get(ip);
    if (previo !== undefined && ahora - previo < VENTANA_AVISO_MS) return false;

    if (ultimoAviso.size >= MAX_ORIGENES_AVISADOS) {
        for (const [origen, instante] of ultimoAviso) {
            if (ahora - instante >= VENTANA_AVISO_MS) ultimoAviso.delete(origen);
        }
        if (ultimoAviso.size >= MAX_ORIGENES_AVISADOS) ultimoAviso.delete(ultimoAviso.keys().next().value);
    }
    ultimoAviso.set(ip, ahora);
    return true;
}

async function avisarAN8n(acceso, auditoriaId) {
    const url = process.env.HONEYPOT_WEBHOOK_URL;
    if (!url) return false;

    const encabezados = { 'Content-Type': 'application/json' };
    const token = leerSecreto('HONEYPOT_WEBHOOK_TOKEN');
    if (token) encabezados['X-Honeypot-Token'] = token;

    try {
        const respuesta = await fetch(url, {
            method: 'POST',
            headers: encabezados,
            body: JSON.stringify({ evento: 'honeypot', severidad: 'alta', auditoriaId, ...acceso }),
            signal: AbortSignal.timeout(TIMEOUT_WEBHOOK_MS)
        });
        if (!respuesta.ok) console.warn(`Honeypot: n8n respondio ${respuesta.status}.`);
        return respuesta.ok;
    } catch (error) {
        console.warn(`Honeypot: no se pudo avisar a n8n (${error.name}: ${error.message}).`);
        return false;
    }
}

const honeypot = async (req, res) => {
    const acceso = describirAcceso(req);
    rayuelaHoneypotHits.inc();
    console.warn(`[honeypot] ${acceso.metodo} ${acceso.ruta} desde ${acceso.ip} (${acceso.userAgent || 'sin User-Agent'})`);

    let auditoriaId = null;
    try {
        const registro = await Auditoria.create({
            accion: 'HONEYPOT',
            tablaAfectada: 'honeypot',
            registroId: null,
            usuarioId: null,
            detalle: JSON.stringify(acceso),
            fecha: new Date()
        });
        auditoriaId = registro.id;
    } catch (error) {
        console.error('Honeypot: no se pudo registrar el acceso en auditorias:', error.message);
    }

    // El aviso no bloquea la respuesta: el atacante no debe notar demora ni errores internos.
    if (correspondeAvisar(acceso.ip)) {
        avisarAN8n(acceso, auditoriaId).catch(() => {});
    }

    res.status(401).json({ status: 0, msg: 'Acceso denegado. Token no proporcionado.' });
};

// Solo para pruebas.
const reiniciarAvisos = () => ultimoAviso.clear();

module.exports = { honeypot, reiniciarAvisos, cabecerasSeguras };
