import request from 'supertest';
import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';

/**
 * CORS integration tests — validates origin handling, preflight OPTIONS,
 * and the fallback behavior when CORS_ORIGINS is empty in non-production.
 *
 * In test/dev mode with no CORS_ORIGINS, cors({ origin: false }) is used,
 * which means CORS is effectively "allow all" (no restriction applied).
 */

const { app } = createRouteTestApp();

describe('CORS configuration', () => {
  beforeEach(() => {
    resetRateLimits();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  describe('when CORS_ORIGINS is empty and not in production', () => {
    // Default test env has no CORS_ORIGINS set and NODE_ENV=test,
    // so corsOrigins resolves to `false` (cors lib: no restriction).

    it('allows requests without Origin header', async () => {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
    });

    it('allows requests from any origin', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'https://any-random-origin.example.com');

      expect(res.status).toBe(200);
    });

    it('responds to OPTIONS preflight with 204', async () => {
      const res = await request(app)
        .options('/api/health')
        .set('Origin', 'https://example.com')
        .set('Access-Control-Request-Method', 'POST');

      expect(res.status).toBe(204);
    });

    it('includes allowed methods in preflight response', async () => {
      const res = await request(app)
        .options('/api/health')
        .set('Origin', 'https://example.com')
        .set('Access-Control-Request-Method', 'POST');

      const allowedMethods = res.headers['access-control-allow-methods'];
      expect(allowedMethods).toBeDefined();
      expect(allowedMethods).toContain('GET');
      expect(allowedMethods).toContain('POST');
      expect(allowedMethods).toContain('PUT');
      expect(allowedMethods).toContain('PATCH');
      expect(allowedMethods).toContain('DELETE');
    });

    it('includes allowed headers in preflight response', async () => {
      const res = await request(app)
        .options('/api/health')
        .set('Origin', 'https://example.com')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'Authorization,Content-Type');

      const allowedHeaders = res.headers['access-control-allow-headers'];
      expect(allowedHeaders).toBeDefined();
      expect(allowedHeaders).toContain('Content-Type');
      expect(allowedHeaders).toContain('Authorization');
    });

    it('includes credentials support header', async () => {
      const res = await request(app).get('/api/health').set('Origin', 'https://example.com');

      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  describe('standard API responses include security headers', () => {
    it('sets default Cache-Control: no-store on non-health routes', async () => {
      // The /api/health route overrides Cache-Control, so use a different endpoint
      // that doesn't — a 404 still passes through global middleware.
      const res = await request(app).get('/api/nonexistent-route');

      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('sets Helmet security headers', async () => {
      const res = await request(app).get('/api/health');

      // In non-production, helmet sets X-Content-Type-Options
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
  });
});
