import express from 'express';
import request from 'supertest';

import { errorHandler } from '@shared/middleware/error.middleware';
import { stopRateLimitSweep } from '@shared/middleware/rate-limit.middleware';
import { createMuseumRouter } from '@modules/museum/adapters/primary/http/routes/museum.route';

import { makeToken } from '../../helpers/auth/token.helpers';

import type { DetectMuseumUseCase } from '@modules/museum/useCase/detect/detect-museum.useCase';
import type { MuseumDetectionResult } from '@modules/museum/domain/museum/museum-detection-result';

jest.mock('@modules/museum/useCase', () => ({
  buildSearchMuseumsUseCase: () => ({ execute: jest.fn() }),
  createMuseumUseCase: { execute: jest.fn() },
  getMuseumUseCase: { execute: jest.fn() },
  listMuseumsUseCase: { execute: jest.fn() },
  updateMuseumUseCase: { execute: jest.fn() },
  museumRepository: {},
}));

jest.mock('@shared/audit', () => ({ auditService: { log: jest.fn() } }));

// Avoid pulling the prom-client registry into a side-effecting state — the
// real metric module is loaded once at app boot ; for these tests we only
// care that the route wires up correctly.
jest.mock('@shared/observability/prometheus-metrics', () => ({
  geoDetectMuseumTotal: { labels: () => ({ inc: jest.fn() }) },
  nominatimRequestsTotal: { labels: () => ({ inc: jest.fn() }) },
  nominatimRequestDurationSeconds: { observe: jest.fn() },
}));

function makeApp(detectMuseumUseCase: DetectMuseumUseCase) {
  const app = express();
  app.use(express.json());
  app.use('/api/museums', createMuseumRouter({ detectMuseumUseCase }));
  app.use(errorHandler);
  return app;
}

describe('GET /api/museums/detect-museum', () => {
  afterAll(() => {
    stopRateLimitSweep();
  });

  it('returns 401 without auth token', async () => {
    const useCase = { execute: jest.fn() } as unknown as DetectMuseumUseCase;
    const res = await request(makeApp(useCase)).get(
      '/api/museums/detect-museum?lat=48.86&lng=2.34',
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 on missing lng', async () => {
    const useCase = { execute: jest.fn() } as unknown as DetectMuseumUseCase;
    const res = await request(makeApp(useCase))
      .get('/api/museums/detect-museum?lat=48.86')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
  });

  it('returns 400 on out-of-range lat', async () => {
    const useCase = { execute: jest.fn() } as unknown as DetectMuseumUseCase;
    const res = await request(makeApp(useCase))
      .get('/api/museums/detect-museum?lat=100&lng=2.34')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
  });

  it('returns 200 with the detection result on happy path', async () => {
    const detected: MuseumDetectionResult = {
      museumId: 42,
      confidence: 1.0,
      distance: 0,
      name: 'Louvre',
    };
    const execute = jest.fn().mockResolvedValue(detected);
    const useCase = { execute } as unknown as DetectMuseumUseCase;

    const res = await request(makeApp(useCase))
      .get('/api/museums/detect-museum?lat=48.86&lng=2.34')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(detected);
    expect(execute).toHaveBeenCalledWith(48.86, 2.34);
  });

  it('rate-limits to 30 req/min/user (31st returns 429)', async () => {
    const execute = jest
      .fn()
      .mockResolvedValue({ museumId: null, confidence: 0, distance: null, name: null });
    const useCase = { execute } as unknown as DetectMuseumUseCase;
    const app = makeApp(useCase);
    const token = makeToken();

    for (let i = 0; i < 30; i += 1) {
      const ok = await request(app)
        .get('/api/museums/detect-museum?lat=48.86&lng=2.34')
        .set('Authorization', `Bearer ${token}`);
      expect(ok.status).toBe(200);
    }
    const blocked = await request(app)
      .get('/api/museums/detect-museum?lat=48.86&lng=2.34')
      .set('Authorization', `Bearer ${token}`);
    expect(blocked.status).toBe(429);
  });
});
