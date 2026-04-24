import request from 'supertest';

import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';
import { userToken } from '../../helpers/auth/token.helpers';

// ── Mock use cases so handlers execute without DB ────────────────────

const mockCreateReview = jest.fn();
const mockListApprovedReviews = jest.fn();
const mockGetReviewStats = jest.fn();

jest.mock('@modules/review/useCase', () => ({
  createReviewUseCase: { execute: (...args: unknown[]) => mockCreateReview(...args) },
  listApprovedReviewsUseCase: { execute: (...args: unknown[]) => mockListApprovedReviews(...args) },
  getReviewStatsUseCase: { execute: () => mockGetReviewStats() },
  // Admin use cases needed by admin.route barrel
  listAllReviewsUseCase: { execute: jest.fn() },
  moderateReviewUseCase: { execute: jest.fn() },
}));

// ── Mock PG user repository so the default author resolver can resolve
//    the authenticated user without a live database.

const mockGetUserById = jest.fn();

jest.mock('@modules/auth/adapters/secondary/user.repository.pg', () => ({
  UserRepositoryPg: jest.fn().mockImplementation(() => ({
    getUserById: (id: number) => mockGetUserById(id),
  })),
}));

const { app } = createRouteTestApp();

describe('Review Routes — Unit', () => {
  beforeEach(() => {
    resetRateLimits();
    jest.clearAllMocks();
    mockGetUserById.mockResolvedValue({
      id: 1,
      firstname: 'Ada',
      lastname: 'Lovelace',
      email: 'ada@example.com',
      role: 'visitor',
    });
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  // ── POST /api/reviews ─────────────────────────────────────────

  describe('POST /api/reviews', () => {
    const validBody = {
      rating: 5,
      comment: 'An absolutely wonderful museum experience!',
    };

    it('returns 201 and derives userName server-side from authenticated user', async () => {
      const mockReview = {
        id: 'rev-1',
        userId: 1,
        userName: 'Ada L.',
        rating: 5,
        comment: 'An absolutely wonderful museum experience!',
        status: 'pending',
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      mockCreateReview.mockResolvedValue(mockReview);

      const res = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${userToken()}`)
        .send(validBody);

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ review: mockReview });
      expect(mockCreateReview).toHaveBeenCalledWith({
        user: expect.objectContaining({ id: 1, firstname: 'Ada', lastname: 'Lovelace' }),
        rating: 5,
        comment: 'An absolutely wonderful museum experience!',
      });
    });

    it('ignores client-supplied userName (schema strips it)', async () => {
      mockCreateReview.mockResolvedValue({ id: 'rev-2' });

      const res = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ ...validBody, userName: 'Spoofed Identity' });

      // Schema should be permissive to extra keys (zod .object default strips),
      // but userName must never reach the use-case payload.
      expect(res.status).toBe(201);
      const call = mockCreateReview.mock.calls[0][0] as Record<string, unknown>;
      expect(call).not.toHaveProperty('userName');
    });

    it('returns 401 without auth token', async () => {
      const res = await request(app).post('/api/reviews').send(validBody);

      expect(res.status).toBe(401);
      expect(mockCreateReview).not.toHaveBeenCalled();
    });

    it('returns 401 when authenticated user cannot be resolved', async () => {
      mockGetUserById.mockResolvedValueOnce(null);
      const res = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${userToken()}`)
        .send(validBody);

      expect(res.status).toBe(401);
      expect(mockCreateReview).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid body (missing rating)', async () => {
      const res = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ comment: 'A sufficiently long comment' });

      expect(res.status).toBe(400);
      expect(mockCreateReview).not.toHaveBeenCalled();
    });

    it('returns 400 for empty body', async () => {
      const res = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('returns 400 for rating out of range', async () => {
      const res = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ ...validBody, rating: 6 });

      expect(res.status).toBe(400);
    });

    it('returns 400 for comment too short', async () => {
      const res = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ ...validBody, comment: 'Short' });

      expect(res.status).toBe(400);
    });
  });

  // ── GET /api/reviews ──────────────────────────────────────────

  describe('GET /api/reviews', () => {
    it('returns paginated approved reviews with default params', async () => {
      const mockResult = {
        data: [
          {
            id: 'rev-1',
            userName: 'Alice',
            rating: 5,
            comment: 'Wonderful!',
            status: 'approved',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      };
      mockListApprovedReviews.mockResolvedValue(mockResult);

      const res = await request(app).get('/api/reviews');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockResult);
      expect(mockListApprovedReviews).toHaveBeenCalledWith({ page: 1, limit: 20 });
    });

    it('forwards custom pagination query params', async () => {
      mockListApprovedReviews.mockResolvedValue({
        data: [],
        total: 0,
        page: 3,
        limit: 10,
        totalPages: 0,
      });

      const res = await request(app).get('/api/reviews?page=3&limit=10');

      expect(res.status).toBe(200);
      expect(mockListApprovedReviews).toHaveBeenCalledWith({ page: 3, limit: 10 });
    });

    it('is accessible without authentication (public endpoint)', async () => {
      mockListApprovedReviews.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });

      const res = await request(app).get('/api/reviews');
      expect(res.status).not.toBe(401);
    });
  });

  // ── GET /api/reviews/stats ────────────────────────────────────

  describe('GET /api/reviews/stats', () => {
    it('returns stats object', async () => {
      const mockStats = { average: 4.3, count: 47 };
      mockGetReviewStats.mockResolvedValue(mockStats);

      const res = await request(app).get('/api/reviews/stats');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockStats);
      expect(mockGetReviewStats).toHaveBeenCalledTimes(1);
    });

    it('is accessible without authentication (public endpoint)', async () => {
      mockGetReviewStats.mockResolvedValue({ average: 0, count: 0 });

      const res = await request(app).get('/api/reviews/stats');
      expect(res.status).not.toBe(401);
    });
  });
});
