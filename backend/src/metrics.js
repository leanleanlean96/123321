'use strict';

const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});


const todosCreatedTotal = new client.Counter({
  name: 'todos_created_total',
  help: 'Total number of TODO items created',
  registers: [register],
});

const todosCompletedTotal = new client.Counter({
  name: 'todos_completed_total',
  help: 'Total number of TODO items marked as completed',
  registers: [register],
});

function httpMetricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const route = (req.route && req.route.path)
      ? (req.baseUrl || '') + req.route.path
      : 'unmatched';
    const status = String(res.statusCode);
    const elapsedSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    httpRequestsTotal.inc({ method: req.method, route, status });
    httpRequestDurationSeconds.observe({ method: req.method, route, status }, elapsedSeconds);
  });
  next();
}

module.exports = {
  register,
  httpMetricsMiddleware,
  todosCreatedTotal,
  todosCompletedTotal,
};
