import request from 'supertest';

import { adminToken, makeToken } from '../../helpers/auth/token.helpers';
import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';

import { notFound } from '@shared/errors/app.error';

import type { EnrichMuseumResult } from '@modules/museum/domain/enrichment.types';

// ── Mocks ────────────────────────────────────────────────────────
// Museum barrel — replace `buildEnrichMuseumUseCase` with our in-memory
// double so `api.router.ts` wires the fake use case into the router.

const mockExecute = jest.fn<Promise<EnrichMuseumResult>, [{ museumId: number; locale: string }]>();
const mockGetJobStatus = jest.fn<
  Promise<EnrichMuseumResult>,
  [{ museumId: number; locale: string; jobId: string }]
>();

jest.mock('@modules/museum/useCase', () => {
  const fakeEnrichUseCase = {
    execute: (input: { museumId: number; locale: string }) => mockExecute(input),
    getJobStatus: (input: { museumId: number; locale: string; jobId: string }) =>
      mockGetJobStatus(input),
  };
  return {
    listMuseumsUseCase: { execute: jest.fn().mockResolvedValue([]) },
    createMuseumUseCase: { execute: jest.fn() },
    getMuseumUseCase: { execute: jest.fn() },
    updateMuseumUseCase: { execute: jest.fn() },
    buildSearchMuseumsUseCase: () => ({ execute: jest.fn() }),
    buildLowDataPackService: () => ({
      getLowDataPack: jest
        .fn()
        .mockResolvedValue({ museumId: '', locale: 'fr', generatedAt: '', entries: [] }),
    }),
    buildEnrichMuseumUseCase: () => fakeEnrichUseCase,
    museumRepository: {},
  };
});

// Prevent BullMQ/Redis real connection at boot.
jest.mock('@modules/museum/adapters/secondary/bullmq-museum-enrichment-queue.adapter', () => ({
  MUSEUM_ENRICHMENT_QUEUE_NAME: 'museum-enrichment',
  BullmqMuseumEnrichmentQueueAdapter: jest.fn().mockImplementation(() => ({
    enqueue: jest.fn(),
    getJobStatus: jest.fn(),
    isJobActive: jest.fn(),
    close: jest.fn(),
  })),
}));

jest.mock('@shared/audit', () => ({
  auditService: { log: jest.fn() },
}));

const { app } = createRouteTestApp();

describe('Museum Enrichment Routes — HTTP Layer', () => {
  beforeEach(() => {
    resetRateLimits();
    jest.clearAllMocks();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  describe('GET /api/museums/:id/enrichment', () => {
    it('returns 401 when not authenticated', async () => {
      const res = await request(app).get('/api/museums/1/enrichment?locale=fr');
      expect(res.status).toBe(401);
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('returns 200 + data when cache hit (ready)', async () => {
      mockExecute.mockResolvedValueOnce({
        status: 'ready',
        data: {
          museumId: 1,
          locale: 'fr',
          summary: 'Famous Paris museum',
          wikidataQid: 'Q19675',
          website: 'https://www.louvre.fr',
          phone: null,
          imageUrl: null,
          openingHours: null,
          fetchedAt: '2026-04-22T10:00:00.000Z',
        },
      });

      const res = await request(app)
        .get('/api/museums/1/enrichment?locale=fr')
        .set('Authorization', `Bearer ${makeToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
      expect(res.body.data.wikidataQid).toBe('Q19675');
      expect(mockExecute).toHaveBeenCalledWith({ museumId: 1, locale: 'fr' });
    });

    it('returns 202 + jobId when cache miss (pending)', async () => {
      mockExecute.mockResolvedValueOnce({ status: 'pending', jobId: 'mus:1:fr' });

      const res = await request(app)
        .get('/api/museums/1/enrichment?locale=fr')
        .set('Authorization', `Bearer ${makeToken()}`);

      expect(res.status).toBe(202);
      expect(res.body).toEqual({ status: 'pending', jobId: 'mus:1:fr' });
    });

    it('returns 404 when museumId unknown (use case throws NotFound)', async () => {
      mockExecute.mockRejectedValueOnce(notFound('Museum not found'));

      const res = await request(app)
        .get('/api/museums/9999/enrichment?locale=fr')
        .set('Authorization', `Bearer ${adminToken()}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 when locale query param missing', async () => {
      const res = await request(app)
        .get('/api/museums/1/enrichment')
        .set('Authorization', `Bearer ${makeToken()}`);

      expect(res.status).toBe(400);
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('returns 400 for non-numeric museumId', async () => {
      const res = await request(app)
        .get('/api/museums/not-a-number/enrichment?locale=fr')
        .set('Authorization', `Bearer ${makeToken()}`);

      // `/:id/enrichment` should not collide with `/:idOrSlug` (which uses
      // a string param) — `parseMuseumIdParam` rejects non-numeric with 400.
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/museums/:id/enrichment/status', () => {
    it('returns 200 when job completed (ready)', async () => {
      mockGetJobStatus.mockResolvedValueOnce({
        status: 'ready',
        data: {
          museumId: 1,
          locale: 'fr',
          summary: 's',
          wikidataQid: 'Q1',
          website: null,
          phone: null,
          imageUrl: null,
          openingHours: null,
          fetchedAt: '2026-04-22T10:00:00.000Z',
        },
      });

      const res = await request(app)
        .get('/api/museums/1/enrichment/status?locale=fr&jobId=mus:1:fr')
        .set('Authorization', `Bearer ${makeToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
      expect(mockGetJobStatus).toHaveBeenCalledWith({
        museumId: 1,
        locale: 'fr',
        jobId: 'mus:1:fr',
      });
    });

    it('returns 202 when job still active (pending)', async () => {
      mockGetJobStatus.mockResolvedValueOnce({ status: 'pending', jobId: 'mus:1:fr' });

      const res = await request(app)
        .get('/api/museums/1/enrichment/status?locale=fr&jobId=mus:1:fr')
        .set('Authorization', `Bearer ${makeToken()}`);

      expect(res.status).toBe(202);
      expect(res.body).toEqual({ status: 'pending', jobId: 'mus:1:fr' });
    });

    it('returns 401 when not authenticated', async () => {
      const res = await request(app).get(
        '/api/museums/1/enrichment/status?locale=fr&jobId=mus:1:fr',
      );
      expect(res.status).toBe(401);
      expect(mockGetJobStatus).not.toHaveBeenCalled();
    });

    it('returns 400 when jobId missing', async () => {
      const res = await request(app)
        .get('/api/museums/1/enrichment/status?locale=fr')
        .set('Authorization', `Bearer ${makeToken()}`);

      expect(res.status).toBe(400);
      expect(mockGetJobStatus).not.toHaveBeenCalled();
    });
  });
});
