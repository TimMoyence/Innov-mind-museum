/**
 * RED — T1.12 — R11 — `POST /api/chat/art-keywords` MUST rate-limit at
 * 10 successful POSTs / 60s / user. 11th request from same user → 429.
 *
 * Spec : team-state/2026-05-21-p0-c3-auth-crypto/spec.md §R11.
 * Design : team-state/2026-05-21-p0-c3-auth-crypto/design.md §3.4 :
 *   - new `taxonomyWriteLimiter = createRateLimitMiddleware({ limit: 10,
 *     windowMs: 60_000, keyGenerator: byUserId })`.
 *   - mounted AFTER `requireRole` (CLAUDE.md "Mutating middleware ordering").
 *
 * Anchored to PATTERNS / LESSONS :
 *  - `lib-docs/ioredis/PATTERNS.md` §3 DON'T #11 — atomic Lua INCR+EXPIRE
 *    (assumed correct in `createRateLimitMiddleware` ; this test exercises
 *    the in-memory fallback which uses the same semantic).
 *  - CLAUDE.md "Mutating middleware ordering" — limiter consumes a slot only
 *    AFTER auth/role gates pass.
 *  - `mfa.route.ts:163-167` pattern : `byUserId` key generator + 5/15m limit.
 *    Mirror chosen for taxonomy writes.
 *
 * Failure mode at HEAD `00325d81` :
 *  - No per-route limiter on POST /art-keywords ; the global rate-limit
 *    (`env.rateLimit.userLimit` ~60) is the only gate. 11 burst requests
 *    succeed → 11th expected 429 → green-phase only.
 *
 * Run scope :
 *   pnpm jest tests/unit/chat/chat-message.art-keywords.ratelimit.test.ts
 */

import express from 'express';
import request from 'supertest';

import { createMessageRouter } from '@modules/chat/adapters/primary/http/routes/chat-message.route';
import { errorHandler } from '@shared/middleware/error.middleware';
import {
  clearRateLimitBuckets,
  stopRateLimitSweep,
} from '@shared/middleware/rate-limit.middleware';

import { adminToken } from '../../helpers/auth/token.helpers';

import type { ArtKeyword } from '@modules/chat/domain/art-keyword/artKeyword.entity';
import type { ArtKeywordRepository } from '@modules/chat/domain/art-keyword/artKeyword.repository.interface';
import type { ChatService } from '@modules/chat/useCase/orchestration/chat.service';

class InMemoryArtKeywordRepository implements ArtKeywordRepository {
  bulkUpsertCount = 0;

  async findByLocale(): Promise<ArtKeyword[]> {
    return [];
  }
  async findByLocaleSince(): Promise<ArtKeyword[]> {
    return [];
  }
  async upsert(): Promise<ArtKeyword> {
    return {} as ArtKeyword;
  }
  async bulkUpsert(): Promise<void> {
    this.bulkUpsertCount += 1;
  }
}

const buildApp = (repo: ArtKeywordRepository): express.Express => {
  const app = express();
  app.use(express.json());
  const chatService = {} as ChatService;
  app.use('/api/chat', createMessageRouter(chatService, repo));
  app.use(errorHandler);
  return app;
};

describe('POST /api/chat/art-keywords — taxonomyWriteLimiter (R11)', () => {
  let repo: InMemoryArtKeywordRepository;
  let app: express.Express;

  beforeEach(() => {
    clearRateLimitBuckets();
    repo = new InMemoryArtKeywordRepository();
    app = buildApp(repo);
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('first 10 POSTs by same admin succeed; 11th returns 429 TOO_MANY_REQUESTS (R11.a)', async () => {
    const token = adminToken();

    for (let i = 0; i < 10; i += 1) {
      const res = await request(app)
        .post('/api/chat/art-keywords')
        .set('Authorization', `Bearer ${token}`)
        .send({ keywords: [`kw-${String(i)}`], locale: 'fr' });
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(429);
    }

    const eleventh = await request(app)
      .post('/api/chat/art-keywords')
      .set('Authorization', `Bearer ${token}`)
      .send({ keywords: ['kw-overflow'], locale: 'fr' });

    expect(eleventh.status).toBe(429);
    expect(eleventh.body?.error?.code ?? eleventh.body?.code).toMatch(/TOO_MANY_REQUESTS/);
  });

  it('429 response carries a Retry-After header (rate-limit doctrine, lib-docs/ioredis PATTERNS §3)', async () => {
    const token = adminToken();
    for (let i = 0; i < 10; i += 1) {
      await request(app)
        .post('/api/chat/art-keywords')
        .set('Authorization', `Bearer ${token}`)
        .send({ keywords: [`kw-${String(i)}`], locale: 'fr' });
    }

    const eleventh = await request(app)
      .post('/api/chat/art-keywords')
      .set('Authorization', `Bearer ${token}`)
      .send({ keywords: ['kw-overflow'], locale: 'fr' });

    expect(eleventh.status).toBe(429);
    expect(eleventh.headers['retry-after']).toBeDefined();
  });

  it('GET /api/chat/art-keywords NOT subject to the write limiter (read path independent)', async () => {
    const token = adminToken();
    // 15 GETs >>> 10 (write limit). All must succeed (or surface a different
    // limit, but never the taxonomy-write 429 specifically).
    for (let i = 0; i < 15; i += 1) {
      const res = await request(app)
        .get('/api/chat/art-keywords?locale=fr')
        .set('Authorization', `Bearer ${token}`);
      // Either 200 with empty body or 404 (repo empty / wiring) — never 429
      // from THIS test's POST-limiter bucket.
      expect(res.status).not.toBe(429);
    }
  });
});
