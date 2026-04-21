import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

import {
  makeArtworkKnowledge,
  makeMockArtworkKnowledgeRepo,
} from '../../helpers/knowledge-extraction/extraction.fixtures';
import { adminToken, visitorToken } from '../../helpers/auth/token.helpers';
import { createAdminKeRouter } from '@modules/admin/adapters/primary/http/admin-ke.route';

// ── Auth middleware mocks ──────────────────────────────────────────────────────

jest.mock('@src/helpers/middleware/authenticated.middleware', () => ({
  isAuthenticated: (req: Request, _res: Response, next: NextFunction) => {
    const auth = req.headers.authorization;
    if (!auth) {
      const err = Object.assign(new Error('Token required'), { statusCode: 401 });
      return next(err);
    }
    next();
  },
}));

// requireRole mock: reads the role from the test-injected req.role header
jest.mock('@src/helpers/middleware/require-role.middleware', () => ({
  requireRole:
    (...allowed: string[]) =>
    (req: Request, _res: Response, next: NextFunction) => {
      const role = (req.headers['x-test-role'] as string) ?? 'visitor';
      if (!allowed.includes(role)) {
        return next(Object.assign(new Error('Forbidden'), { statusCode: 403 }));
      }
      next();
    },
}));

jest.mock('@shared/audit', () => ({
  auditService: { log: jest.fn() },
}));

jest.mock('@src/helpers/middleware/validate-query.middleware', () => ({
  validateQuery:
    (schema: { parse: (q: unknown) => unknown }) =>
    (req: Request, res: Response, next: NextFunction) => {
      try {
        res.locals.validatedQuery = schema.parse(req.query);
        next();
      } catch (e) {
        next(e);
      }
    },
}));

// ── Test app factory ──────────────────────────────────────────────────────────

function makeApp(repoOverrides: Parameters<typeof makeMockArtworkKnowledgeRepo>[0] = {}) {
  const repo = makeMockArtworkKnowledgeRepo(repoOverrides);
  const app = express();
  app.use(express.json());
  app.use('/', createAdminKeRouter(repo));
  // Minimal error handler
  app.use(
    (
      err: { statusCode?: number; message?: string },
      _req: Request,
      res: Response,
      _next: NextFunction,
    ) => {
      res.status(err.statusCode ?? 500).json({ message: err.message ?? 'Internal error' });
    },
  );
  return { app, repo };
}

const adminHeaders = { Authorization: 'Bearer test-token', 'x-test-role': 'admin' };

// ── GET /ke/pending ───────────────────────────────────────────────────────────

describe('GET /ke/pending', () => {
  it('returns empty list when no items need review', async () => {
    const { app } = makeApp({ findNeedsReview: jest.fn().mockResolvedValue([]) });

    const res = await request(app).get('/ke/pending').set(adminHeaders);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], count: 0 });
  });

  it('returns items with needsReview=true', async () => {
    const artwork = makeArtworkKnowledge({ needsReview: true, confidence: 0.3 });
    const { app } = makeApp({ findNeedsReview: jest.fn().mockResolvedValue([artwork]) });

    const res = await request(app).get('/ke/pending').set(adminHeaders);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.items[0]).toMatchObject({ id: artwork.id, needsReview: true });
  });

  it('passes limit query param to repo', async () => {
    const findNeedsReview = jest.fn().mockResolvedValue([]);
    const { app } = makeApp({ findNeedsReview });

    await request(app).get('/ke/pending?limit=10').set(adminHeaders);

    expect(findNeedsReview).toHaveBeenCalledWith(10);
  });

  it('uses default limit=50 when not specified', async () => {
    const findNeedsReview = jest.fn().mockResolvedValue([]);
    const { app } = makeApp({ findNeedsReview });

    await request(app).get('/ke/pending').set(adminHeaders);

    expect(findNeedsReview).toHaveBeenCalledWith(50);
  });

  it('returns 401 without auth', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/ke/pending');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin role', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .get('/ke/pending')
      .set({ Authorization: 'Bearer token', 'x-test-role': 'visitor' });
    expect(res.status).toBe(403);
  });
});

// ── PATCH /ke/:id/approve ─────────────────────────────────────────────────────

describe('PATCH /ke/:id/approve', () => {
  it('approves item and returns updated record', async () => {
    const artwork = makeArtworkKnowledge({ needsReview: false });
    const { app } = makeApp({ approve: jest.fn().mockResolvedValue(artwork) });

    const res = await request(app).patch(`/ke/${artwork.id}/approve`).set(adminHeaders);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: artwork.id, needsReview: false });
  });

  it('returns 404 when item does not exist', async () => {
    const { app } = makeApp({ approve: jest.fn().mockResolvedValue(null) });

    const res = await request(app).patch('/ke/nonexistent-id/approve').set(adminHeaders);

    expect(res.status).toBe(404);
  });

  it('returns 401 without auth', async () => {
    const { app } = makeApp();
    const res = await request(app).patch('/ke/some-id/approve');
    expect(res.status).toBe(401);
  });

  it('calls approve with the correct id', async () => {
    const artwork = makeArtworkKnowledge({ needsReview: false });
    const approve = jest.fn().mockResolvedValue(artwork);
    const { app } = makeApp({ approve });

    await request(app).patch(`/ke/${artwork.id}/approve`).set(adminHeaders);

    expect(approve).toHaveBeenCalledWith(artwork.id);
  });
});

// silence unused import warning from token helpers
void adminToken;
void visitorToken;
