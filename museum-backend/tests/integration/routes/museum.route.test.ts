import request from 'supertest';
import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';
import { adminToken, visitorToken, makeToken } from '../../helpers/auth/token.helpers';

// ── Mock use cases so handlers execute without DB ────────────────────

const mockListMuseums = jest.fn();
const mockCreateMuseum = jest.fn();
const mockGetMuseum = jest.fn();
const mockUpdateMuseum = jest.fn();
const mockSearchMuseums = jest.fn();

jest.mock('@modules/museum/useCase', () => ({
  listMuseumsUseCase: { execute: (...args: unknown[]) => mockListMuseums(...args) },
  createMuseumUseCase: { execute: (...args: unknown[]) => mockCreateMuseum(...args) },
  getMuseumUseCase: { execute: (...args: unknown[]) => mockGetMuseum(...args) },
  updateMuseumUseCase: { execute: (...args: unknown[]) => mockUpdateMuseum(...args) },
  buildSearchMuseumsUseCase: () => ({
    execute: (...args: unknown[]) => mockSearchMuseums(...args),
  }),
  buildLowDataPackService: () => ({
    getLowDataPack: jest
      .fn()
      .mockResolvedValue({ museumId: '', locale: 'fr', generatedAt: '', entries: [] }),
  }),
  museumRepository: {},
}));

jest.mock('@shared/audit', () => ({
  auditService: { log: jest.fn() },
}));

/**
 * Museum route integration tests — auth enforcement + RBAC + validation + happy-path handler bodies.
 * No DB required — use cases are mocked.
 */

const { app } = createRouteTestApp();

describe('Museum Routes — HTTP Layer', () => {
  beforeEach(() => {
    resetRateLimits();
    jest.clearAllMocks();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  // ── Unauthenticated access returns 401 ─────────────────────────

  describe('Unauthenticated access returns 401', () => {
    it('GET /api/museums/directory returns 401 without token', async () => {
      const res = await request(app).get('/api/museums/directory');
      expect(res.status).toBe(401);
    });

    it('POST /api/museums returns 401 without token', async () => {
      const res = await request(app).post('/api/museums').send({ name: 'Test', slug: 'test' });
      expect(res.status).toBe(401);
    });

    it('GET /api/museums returns 401 without token', async () => {
      const res = await request(app).get('/api/museums');
      expect(res.status).toBe(401);
    });

    it('GET /api/museums/:idOrSlug returns 401 without token', async () => {
      const res = await request(app).get('/api/museums/1');
      expect(res.status).toBe(401);
    });

    it('PUT /api/museums/:id returns 401 without token', async () => {
      const res = await request(app).put('/api/museums/1').send({ name: 'Updated' });
      expect(res.status).toBe(401);
    });

    it('GET /api/museums/search returns 401 without token', async () => {
      const res = await request(app).get('/api/museums/search?lat=48.86&lng=2.33');
      expect(res.status).toBe(401);
    });
  });

  // ── Visitor role (non-admin) RBAC ──────────────────────────────

  describe('Visitor role returns 403 on admin-only museum routes', () => {
    it('POST /api/museums returns 403 for visitor', async () => {
      const res = await request(app)
        .post('/api/museums')
        .set('Authorization', `Bearer ${visitorToken()}`)
        .send({ name: 'Test', slug: 'test' });
      expect(res.status).toBe(403);
    });

    it('GET /api/museums returns 403 for visitor (admin list)', async () => {
      const res = await request(app)
        .get('/api/museums')
        .set('Authorization', `Bearer ${visitorToken()}`);
      expect(res.status).toBe(403);
    });

    it('PUT /api/museums/:id returns 403 for visitor', async () => {
      const res = await request(app)
        .put('/api/museums/1')
        .set('Authorization', `Bearer ${visitorToken()}`)
        .send({ name: 'Updated' });
      expect(res.status).toBe(403);
    });
  });

  // ── Body validation with admin token ───────────────────────────

  describe('Body validation on museum routes (with admin token)', () => {
    it('POST /api/museums returns 400 for empty body', async () => {
      const res = await request(app)
        .post('/api/museums')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('POST /api/museums returns 400 for missing slug', async () => {
      const res = await request(app)
        .post('/api/museums')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'Test Museum' });
      expect(res.status).toBe(400);
    });

    it('POST /api/museums returns 400 for missing name', async () => {
      const res = await request(app)
        .post('/api/museums')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ slug: 'test-museum' });
      expect(res.status).toBe(400);
    });

    it('POST /api/museums returns 400 for name too long (> 200 chars)', async () => {
      const res = await request(app)
        .post('/api/museums')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'a'.repeat(201), slug: 'test' });
      expect(res.status).toBe(400);
    });

    it('PUT /api/museums/:id returns 400 for name too long', async () => {
      const res = await request(app)
        .put('/api/museums/1')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'a'.repeat(201) });
      expect(res.status).toBe(400);
    });
  });

  // ── Query validation on search ──────────────────────────────────

  describe('GET /api/museums/search — query validation', () => {
    it('returns 400 when lat is provided without lng', async () => {
      const res = await request(app)
        .get('/api/museums/search?lat=48.86')
        .set('Authorization', `Bearer ${makeToken()}`);
      expect(res.status).toBe(400);
    });

    it('returns 400 when lng is provided without lat', async () => {
      const res = await request(app)
        .get('/api/museums/search?lng=2.33')
        .set('Authorization', `Bearer ${makeToken()}`);
      expect(res.status).toBe(400);
    });

    it('returns 400 when lat is out of range', async () => {
      const res = await request(app)
        .get('/api/museums/search?lat=100&lng=2.33')
        .set('Authorization', `Bearer ${makeToken()}`);
      expect(res.status).toBe(400);
    });

    it('returns 400 when radius is below minimum (1000)', async () => {
      const res = await request(app)
        .get('/api/museums/search?lat=48.86&lng=2.33&radius=500')
        .set('Authorization', `Bearer ${makeToken()}`);
      expect(res.status).toBe(400);
    });
  });

  // ── Error response format ──────────────────────────────────────

  describe('Error response format', () => {
    it('401 returns structured JSON with error field', async () => {
      const res = await request(app).get('/api/museums/directory');
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('403 returns structured JSON with FORBIDDEN code', async () => {
      const res = await request(app)
        .post('/api/museums')
        .set('Authorization', `Bearer ${visitorToken()}`)
        .send({ name: 'Test', slug: 'test' });
      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toHaveProperty('code', 'FORBIDDEN');
    });
  });

  // ── Happy-path handler body coverage ─────────────────────────────

  describe('Happy-path — handler bodies', () => {
    it('GET /api/museums/directory returns museum list', async () => {
      const museums = [
        {
          id: 1,
          name: 'Louvre',
          slug: 'louvre',
          address: 'Paris',
          description: 'Famous museum',
          latitude: 48.86,
          longitude: 2.33,
        },
      ];
      mockListMuseums.mockResolvedValueOnce(museums);
      const token = makeToken();

      const res = await request(app)
        .get('/api/museums/directory')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.museums).toHaveLength(1);
      expect(res.body.museums[0]).toEqual({
        id: 1,
        name: 'Louvre',
        slug: 'louvre',
        address: 'Paris',
        description: 'Famous museum',
        latitude: 48.86,
        longitude: 2.33,
      });
      expect(mockListMuseums).toHaveBeenCalledWith({ activeOnly: true });
    });

    it('GET /api/museums/search returns search results', async () => {
      const searchResult = {
        museums: [{ id: 1, name: 'Louvre', distance: 500 }],
      };
      mockSearchMuseums.mockResolvedValueOnce(searchResult);
      const token = makeToken();

      const res = await request(app)
        .get('/api/museums/search?lat=48.86&lng=2.33')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(searchResult);
      expect(mockSearchMuseums).toHaveBeenCalledWith(
        expect.objectContaining({ lat: 48.86, lng: 2.33 }),
      );
    });

    it('POST /api/museums creates museum (admin only)', async () => {
      const created = { id: 10, name: 'New Museum', slug: 'new-museum' };
      mockCreateMuseum.mockResolvedValueOnce(created);

      const res = await request(app)
        .post('/api/museums')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'New Museum', slug: 'new-museum' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ museum: created });
    });

    it('GET /api/museums/:idOrSlug returns single museum', async () => {
      const museum = { id: 1, name: 'Louvre', slug: 'louvre' };
      mockGetMuseum.mockResolvedValueOnce(museum);
      const token = makeToken();

      const res = await request(app)
        .get('/api/museums/louvre')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ museum });
      expect(mockGetMuseum).toHaveBeenCalledWith('louvre');
    });

    it('PUT /api/museums/:id updates museum (admin only)', async () => {
      const updated = { id: 1, name: 'Updated Louvre', slug: 'louvre' };
      mockUpdateMuseum.mockResolvedValueOnce(updated);

      const res = await request(app)
        .put('/api/museums/1')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'Updated Louvre' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ museum: updated });
      expect(mockUpdateMuseum).toHaveBeenCalledWith(1, { name: 'Updated Louvre' });
    });

    it('PUT /api/museums/abc returns 400 for non-numeric ID', async () => {
      const res = await request(app)
        .put('/api/museums/abc')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'Test' });

      expect(res.status).toBe(400);
      expect(mockUpdateMuseum).not.toHaveBeenCalled();
    });

    it('GET /api/museums returns admin museum list', async () => {
      const allMuseums = [
        { id: 1, name: 'Louvre', active: true },
        { id: 2, name: 'Orsay', active: false },
      ];
      mockListMuseums.mockResolvedValueOnce(allMuseums);

      const res = await request(app)
        .get('/api/museums')
        .set('Authorization', `Bearer ${adminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ museums: allMuseums });
      // Admin list calls without activeOnly
      expect(mockListMuseums).toHaveBeenCalledWith();
    });

    it('use case error is forwarded as 500', async () => {
      mockGetMuseum.mockRejectedValueOnce(new Error('DB down'));
      const token = makeToken();

      const res = await request(app)
        .get('/api/museums/louvre')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(500);
    });
  });

  // ── GET /api/museums/:id/low-data-pack (public, no auth) ────────

  describe('GET /api/museums/:id/low-data-pack', () => {
    it('returns 200 with low data pack (default locale fr)', async () => {
      const res = await request(app).get('/api/museums/42/low-data-pack');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('museumId');
      expect(res.body).toHaveProperty('locale');
      expect(res.body).toHaveProperty('entries');
    });

    it('returns 200 with explicit locale query param', async () => {
      const res = await request(app).get('/api/museums/42/low-data-pack?locale=en');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('entries');
    });

    it('sets Cache-Control header', async () => {
      const res = await request(app).get('/api/museums/42/low-data-pack');

      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toContain('public');
      expect(res.headers['cache-control']).toContain('max-age=3600');
    });
  });
});
