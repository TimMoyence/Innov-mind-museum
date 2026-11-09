import request from 'supertest';

import { Review } from '@modules/review/domain/review/review.entity';
import { insertReviewRow } from 'tests/helpers/review/review.fixtures';
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

import type { Express } from 'express';
import type { Repository } from 'typeorm';

type MakeToken = (typeof import('tests/helpers/auth/token.helpers'))['makeToken'];

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

const MUSEUM_A = 42;
const MUSEUM_B = 99;

describeIntegration(
  'admin /reviews — museum_manager tenant isolation (C1B / OWASP API3 BOLA) [integration, real PG + HTTP]',
  () => {
    let harness: IntegrationHarness;
    let app: Express;
    let reviewRepo: Repository<Review>;
    let makeToken: MakeToken;

    let reviewA1: string;
    let reviewA2: string;
    let reviewB1: string;
    let reviewNull1: string;

    beforeAll(async () => {
      harness = await createIntegrationHarness();
      harness.scheduleStop();
      const { createApp } = await import('@src/app');
      const tokenHelpers = await import('tests/helpers/auth/token.helpers');
      makeToken = tokenHelpers.makeToken;
      app = createApp({ healthCheck: async () => ({ database: 'up' }) });
      reviewRepo = harness.dataSource.getRepository(Review);
    });

    beforeEach(async () => {
      await harness.reset();
      reviewA1 = await insertReviewRow(harness.dataSource, {
        rating: 5,
        status: 'pending',
        museumId: MUSEUM_A,
        comment: 'museum A review one — sufficiently long comment.',
      });
      reviewA2 = await insertReviewRow(harness.dataSource, {
        rating: 4,
        status: 'pending',
        museumId: MUSEUM_A,
        comment: 'museum A review two — sufficiently long comment.',
      });
      reviewB1 = await insertReviewRow(harness.dataSource, {
        rating: 3,
        status: 'pending',
        museumId: MUSEUM_B,
        comment: 'museum B review one — sufficiently long comment.',
      });
      reviewNull1 = await insertReviewRow(harness.dataSource, {
        rating: 2,
        status: 'pending',
        museumId: null,
        comment: 'global NULL-museum review — sufficiently long comment.',
      });
    });

    it('manager(42) GET /reviews → 200 with ONLY museum-42 reviews (B + NULL absent)', async () => {
      const token = makeToken({ sub: '1', role: 'museum_manager', museumId: MUSEUM_A });

      const res = await request(app)
        .get('/api/admin/reviews')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const ids = (res.body.data as { id: string }[]).map((r) => r.id);
      expect(ids).toEqual(expect.arrayContaining([reviewA1, reviewA2]));
      expect(ids).toHaveLength(2);
      expect(ids).not.toContain(reviewB1);
      expect(ids).not.toContain(reviewNull1);
      for (const row of res.body.data as { museumId: number | null }[]) {
        expect(row.museumId).toBe(MUSEUM_A);
      }
    });

    it('manager(42) PATCH /reviews/<museum-99 id> → 404 and the B row stays pending', async () => {
      const token = makeToken({ sub: '1', role: 'museum_manager', museumId: MUSEUM_A });

      const res = await request(app)
        .patch(`/api/admin/reviews/${reviewB1}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'approved' });

      expect(res.status).toBe(404);
      const after = await reviewRepo.findOneByOrFail({ id: reviewB1 });
      expect(after.status).toBe('pending');
    });

    it('manager(42) PATCH /reviews/<NULL-museum id> → 404 and the NULL row stays pending', async () => {
      const token = makeToken({ sub: '1', role: 'museum_manager', museumId: MUSEUM_A });

      const res = await request(app)
        .patch(`/api/admin/reviews/${reviewNull1}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'approved' });

      expect(res.status).toBe(404);
      const after = await reviewRepo.findOneByOrFail({ id: reviewNull1 });
      expect(after.status).toBe('pending');
    });

    it('manager(42) PATCH /reviews/<own museum-42 id> → 200 and the row flips to approved', async () => {
      const token = makeToken({ sub: '1', role: 'museum_manager', museumId: MUSEUM_A });

      const res = await request(app)
        .patch(`/api/admin/reviews/${reviewA1}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'approved' });

      expect(res.status).toBe(200);
      const after = await reviewRepo.findOneByOrFail({ id: reviewA1 });
      expect(after.status).toBe('approved');
    });

    it('manager with NO museumId claim GET /reviews → 403, no data', async () => {
      const token = makeToken({ sub: '1', role: 'museum_manager' });

      const res = await request(app)
        .get('/api/admin/reviews')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body).not.toHaveProperty('data');
    });

    it('manager with NO museumId claim PATCH /reviews/<own-tenant id> → 403, row unchanged', async () => {
      const token = makeToken({ sub: '1', role: 'museum_manager' });

      const res = await request(app)
        .patch(`/api/admin/reviews/${reviewA1}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'approved' });

      expect(res.status).toBe(403);
      const after = await reviewRepo.findOneByOrFail({ id: reviewA1 });
      expect(after.status).toBe('pending');
    });

    it('super_admin GET /reviews → 200 sees ALL reviews (42 + 99 + NULL)', async () => {
      const token = makeToken({ sub: '1', role: 'super_admin' });

      const res = await request(app)
        .get('/api/admin/reviews')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const ids = (res.body.data as { id: string }[]).map((r) => r.id);
      expect(ids).toEqual(expect.arrayContaining([reviewA1, reviewA2, reviewB1, reviewNull1]));
      expect(ids).toHaveLength(4);
    });

    it('super_admin PATCH /reviews/<museum-99 id> → 200 (unscoped, cross-tenant write allowed)', async () => {
      const token = makeToken({ sub: '1', role: 'super_admin' });

      const res = await request(app)
        .patch(`/api/admin/reviews/${reviewB1}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'approved' });

      expect(res.status).toBe(200);
      const after = await reviewRepo.findOneByOrFail({ id: reviewB1 });
      expect(after.status).toBe('approved');
    });
  },
);
