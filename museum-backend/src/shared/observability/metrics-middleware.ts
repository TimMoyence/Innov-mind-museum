import {
  httpRequestsTotal,
  httpRequestDurationSeconds,
  renderMetrics,
} from '@shared/observability/prometheus-metrics';

import type { RequestHandler } from 'express';

/** Ordering: mount BEFORE route handlers so it sees every request. */
export const httpMetricsMiddleware: RequestHandler = (req, res, next) => {
  const startNs = process.hrtime.bigint();
  res.on('finish', () => {
    const durationS = Number(process.hrtime.bigint() - startNs) / 1e9;
    // req.route is typed as `any` by @types/express — narrow + fall back to req.path.
    const routeVal: unknown = req.route;
    const routePath =
      routeVal !== null &&
      typeof routeVal === 'object' &&
      'path' in routeVal &&
      typeof routeVal.path === 'string'
        ? (routeVal as { path: string }).path
        : undefined;
    // TD-PC-01 — fall back to literal 'unmatched' (NOT req.path) to bound
    // Prometheus label cardinality. Attacker probing /api/<random> would
    // otherwise explode storage; PATTERNS.md prom-client §3.
    const route = routePath ?? 'unmatched';
    httpRequestsTotal.inc({ route, status: String(res.statusCode), method: req.method });
    httpRequestDurationSeconds.observe({ route, method: req.method }, durationS);
  });
  next();
};

/** GET /metrics — Prometheus scrape endpoint. Returns text/plain. */
export const metricsHandler: RequestHandler = (_req, res, next) => {
  void (async () => {
    try {
      const body = await renderMetrics();
      res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.send(body);
    } catch (err) {
      next(err);
    }
  })();
};
