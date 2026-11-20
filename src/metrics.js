const {
    Counter,
    Gauge,
    Histogram,
    collectDefaultMetrics
} = require('prom-client');

collectDefaultMetrics({ timeout: 5000 });

const rayuelaPaymentSuccess = new Counter({
    name: 'rayuela_payment_success_total',
    help: 'Cantidad de pagos exitosos en Mercado Pago',
    labelNames: ['metodo']
});

const rayuelaPaymentFailure = new Counter({
    name: 'rayuela_payment_failure_total',
    help: 'Cantidad de pagos fallidos en Mercado Pago',
    labelNames: ['metodo', 'reason']
});

const rayuelaGeminiRequests = new Counter({
    name: 'rayuela_gemini_requests_total',
    help: 'Cantidad de solicitudes al servicio de inteligencia artificial (Gemini)',
    labelNames: ['status']
});

const rayuelaRateLimitHits = new Counter({
    name: 'rayuela_rate_limit_hits_total',
    help: 'Solicitudes bloqueadas por el limitador de velocidad (HTTP 429), por ruta',
    labelNames: ['ruta']
});
// Publica las series en 0 desde el inicio: Prometheus las ve aunque todavia no haya bloqueos.
['login', 'verificar_2fa', 'chat'].forEach((ruta) => rayuelaRateLimitHits.inc({ ruta }, 0));

const rayuelaHoneypotHits = new Counter({
    name: 'rayuela_honeypot_hits_total',
    help: 'Accesos al endpoint trampa /api/admin/reset-all (CARD-21 / SEC-02)'
});
rayuelaHoneypotHits.inc(0);

const rayuelaActiveReservations = new Gauge({
    name: 'rayuela_active_reservations_gauge',
    help: 'Cantidad de reservas activas vigentes en el sistema'
});

const rayuelaOpenLibraryLatency = new Histogram({
    name: 'rayuela_open_library_latency_seconds',
    help: 'Latencia de las llamadas a la API de Open Library',
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
});

module.exports = {
    rayuelaPaymentSuccess,
    rayuelaPaymentFailure,
    rayuelaGeminiRequests,
    rayuelaRateLimitHits,
    rayuelaHoneypotHits,
    rayuelaActiveReservations,
    rayuelaOpenLibraryLatency
};
