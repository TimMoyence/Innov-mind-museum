import {
  httpRequestsTotal,
  httpRequestDurationSeconds,
  renderMetrics,
} from '@shared/observability/prometheus-metrics';

import type { RequestHandler } from 'express';

/**
 * Express middleware that records request rate + duration into Prometheus
 * metrics. Mount BEFORE route handlers so it sees every request.
 *
 * Spec: see git log (deleted 2026-05-03 — roadmap consolidation, original spec in commit history)
 */
export const httpMetricsMiddleware: RequestHandler = (req, res, next) => {
  const startNs = process.hrtime.bigint();
  res.on('finish', () => {
    const durationS = Number(process.hrtime.bigint() - startNs) / 1e9;
    // req.route is typed as `any` by @types/express — narrow explicitly.
    // Use the matched route pattern when available, fall back to req.path.
    const routeVal: unknown = req.route;
    const routePath =
      routeVal !== null &&
      typeof routeVal === 'object' &&
      'path' in routeVal &&
      typeof (routeVal as { path: unknown }).path === 'string'
        ? (routeVal as { path: string }).path
        : undefined;
    const route = routePath ?? req.path;
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
