import { httpMetricsMiddleware, metricsHandler } from '@src/helpers/metrics-middleware';
import { registry } from '@shared/observability/prometheus-metrics';

import type { Request, Response } from 'express';

describe('metrics-middleware', () => {
  beforeEach(() => {
    registry.resetMetrics();
  });

  it('httpMetricsMiddleware registers a finish listener and calls next', () => {
    const finishHandlers: (() => void)[] = [];
    const req = { method: 'GET', path: '/foo', route: { path: '/foo' } } as unknown as Request;
    const res = {
      statusCode: 200,
      on: (event: string, cb: () => void) => {
        if (event === 'finish') finishHandlers.push(cb);
      },
    } as unknown as Response;
    const next = jest.fn();

    httpMetricsMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(finishHandlers.length).toBe(1);
  });

  it('metricsHandler responds with Prometheus text/plain content type', async () => {
    let capturedContentType: string | undefined;
    const sent: { body: string | undefined } = { body: undefined };
    const res = {
      setHeader(k: string, v: string) {
        if (k === 'Content-Type') capturedContentType = v;
      },
      send(body: string) {
        sent.body = body;
      },
    } as unknown as Response;

    metricsHandler({} as Request, res, jest.fn());

    // Async send — wait a tick.
    await new Promise((r) => setImmediate(r));

    expect(capturedContentType).toContain('text/plain');
    expect(sent.body).toBeDefined();
  });
});
