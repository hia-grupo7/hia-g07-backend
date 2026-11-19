const { rateLimit } = require('express-rate-limit');
const { rayuelaRateLimitHits } = require('../metrics');

// Rate limiting (CARD-20 / SEC-01): frena la fuerza bruta sobre el login y el abuso del chat con IA.
// Los contadores viven en la memoria de cada instancia del backend (blue y green no los comparten).

const entero = (valor, porDefecto) => {
  const n = parseInt(valor, 10);
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
};

/**
 * @param {string}  ruta        Etiqueta de la métrica rayuela_rate_limit_hits_total.
 * @param {number}  limite      Solicitudes permitidas por ventana; la siguiente recibe HTTP 429.
 * @param {number}  ventanaMs   Duración de la ventana en milisegundos.
 * @param {boolean} soloFallidos Si es true, solo cuentan las respuestas con error (>= 400):
 *                               un login correcto no consume intentos.
 */
function crearLimitador({ ruta, limite, ventanaMs, soloFallidos = false }) {
  return rateLimit({
    windowMs: ventanaMs,
    limit: limite,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: soloFallidos,
    handler: (req, res, next, opciones) => {
      rayuelaRateLimitHits.inc({ ruta });
      const reinicio = req.rateLimit && req.rateLimit.resetTime;
      const segundos = reinicio
        ? Math.max(1, Math.ceil((reinicio.getTime() - Date.now()) / 1000))
        : Math.ceil(opciones.windowMs / 1000);
      res.status(opciones.statusCode).json({
        status: 0,
        msg: `Demasiados intentos. Intente nuevamente en ${segundos} segundos.`
      });
    }
  });
}

const VENTANA_MS = entero(process.env.RATE_LIMIT_VENTANA_MS, 60 * 1000);
const MAX_FALLIDOS = entero(process.env.RATE_LIMIT_LOGIN_MAX, 5);
const MAX_CHAT = entero(process.env.RATE_LIMIT_CHAT_MAX, 10);

// 5 intentos fallidos por minuto y por IP (el 6.º recibe 429).
const limitadorLogin = crearLimitador({ ruta: 'login', limite: MAX_FALLIDOS, ventanaMs: VENTANA_MS, soloFallidos: true });
// El código de verificación de 2 factores (6 dígitos) también se podría adivinar por fuerza bruta.
const limitadorVerificar2FA = crearLimitador({ ruta: 'verificar_2fa', limite: MAX_FALLIDOS, ventanaMs: VENTANA_MS, soloFallidos: true });
// Cada consulta al chat llama a Gemini: se limita el total de solicitudes, no solo las fallidas.
const limitadorChat = crearLimitador({ ruta: 'chat', limite: MAX_CHAT, ventanaMs: VENTANA_MS });

module.exports = { crearLimitador, limitadorLogin, limitadorVerificar2FA, limitadorChat };
