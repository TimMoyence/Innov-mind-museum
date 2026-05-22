/**
 * RED — T1.11 — R10 — `POST /api/chat/art-keywords` MUST require role
 * `ADMIN | MODERATOR | SUPER_ADMIN` (super_admin implicit via `requireRole`).
 *
 * Spec : team-state/2026-05-21-p0-c3-auth-crypto/spec.md §R10.
 * Design : team-state/2026-05-21-p0-c3-auth-crypto/design.md §3.4 :
 *   - middleware chain : isAuthenticated → requireRole(ADMIN, MODERATOR) →
 *     taxonomyWriteLimiter → handler.
 *   - GET `/art-keywords` UNCHANGED (isAuthenticated only).
 *
 * Anchored to PATTERNS / LESSONS :
 *  - `require-role.middleware.ts:22` "super_admin implicitly satisfies any
 *    role check".
 *  - CLAUDE.md "Mutating middleware ordering" — limiter AFTER role gate so
 *    visitors who 403 don't inflate counters.
 *  - OWASP API1+API5 broken function/object level auth (spec §1.4 + §5).
 *
 * Failure mode at HEAD `00325d81` :
 *  - `chat-message.route.ts:184` :
 *      router.post('/art-keywords', isAuthenticated, createBulkUpsertArtKeywordsHandler(repo));
 *    Any authenticated user (visitor included) reaches the handler and gets
 *    201 → the `expect 403` assertions fail.
 *
 * Run scope :
 *   pnpm jest tests/unit/chat/chat-message.art-keywords.authz.test.ts
 */

import express from 'express';
import request from 'supertest';

import { createMessageRouter } from '@modules/chat/adapters/primary/http/routes/chat-message.route';
import { errorHandler } from '@shared/middleware/error.middleware';
import {
  clearRateLimitBuckets,
  stopRateLimitSweep,
} from '@shared/middleware/rate-limit.middleware';

import {
  adminToken,
  makeToken,
  superAdminToken,
  visitorToken,
} from '../../helpers/auth/token.helpers';

import type { ArtKeyword } from '@modules/chat/domain/art-keyword/artKeyword.entity';
import type { ArtKeywordRepository } from '@modules/chat/domain/art-keyword/artKeyword.repository.interface';
import type { ChatService } from '@modules/chat/useCase/orchestration/chat.service';

/**
 * Minimal in-memory repo. bulkUpsert is the only path POST exercises.
 */
class InMemoryArtKeywordRepository implements ArtKeywordRepository {
  bulkUpsertSpy = jest.fn();

  async findByLocale(): Promise<ArtKeyword[]> {
    return [];
  }
  async findByLocaleSince(): Promise<ArtKeyword[]> {
    return [];
  }
  async upsert(): Promise<ArtKeyword> {
    return {} as ArtKeyword;
  }
  async bulkUpsert(keywords: string[], locale: string): Promise<void> {
    this.bulkUpsertSpy(keywords, locale);
  }
}

const moderatorToken = (): string => makeToken({ role: 'moderator' });

/** Build a small express app mounting ONLY the chat-message router under /api/chat. */
const buildApp = (repo: ArtKeywordRepository): express.Express => {
  const app = express();
  app.use(express.json());
  const chatService = {} as ChatService; // not exercised by /art-keywords routes
  app.use('/api/chat', createMessageRouter(chatService, repo));
  app.use(errorHandler);
  return app;
};

describe('POST /api/chat/art-keywords — requireRole (R10)', () => {
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

  it('rejects visitor JWT with 403 FORBIDDEN (R10.a — least privileged)', async () => {
    const res = await request(app)
      .post('/api/chat/art-keywords')
      .set('Authorization', `Bearer ${visitorToken()}`)
      .send({ keywords: ['monet', 'manet'], locale: 'fr' });

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('FORBIDDEN');
    expect(repo.bulkUpsertSpy).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated request with 401 (defense-in-depth — isAuthenticated still first)', async () => {
    const res = await request(app)
      .post('/api/chat/art-keywords')
      .send({ keywords: ['monet'], locale: 'fr' });

    expect(res.status).toBe(401);
    expect(repo.bulkUpsertSpy).not.toHaveBeenCalled();
  });

  it('accepts admin JWT (201) — handler reached, bulkUpsert called (R10.b)', async () => {
    const res = await request(app)
      .post('/api/chat/art-keywords')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ keywords: ['monet', 'manet'], locale: 'fr' });

    expect([200, 201]).toContain(res.status);
    expect(res.status).not.toBe(403);
    expect(repo.bulkUpsertSpy).toHaveBeenCalledTimes(1);
    expect(repo.bulkUpsertSpy).toHaveBeenCalledWith(['monet', 'manet'], 'fr');
  });

  it('accepts moderator JWT (R10.c — design §3.4 allow-list)', async () => {
    const res = await request(app)
      .post('/api/chat/art-keywords')
      .set('Authorization', `Bearer ${moderatorToken()}`)
      .send({ keywords: ['monet'], locale: 'en' });

    expect(res.status).not.toBe(403);
    expect([200, 201]).toContain(res.status);
    expect(repo.bulkUpsertSpy).toHaveBeenCalledTimes(1);
  });

  it('accepts super_admin JWT (R10.d — `requireRole` implicit super_admin pass)', async () => {
    const res = await request(app)
      .post('/api/chat/art-keywords')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ keywords: ['monet'], locale: 'en' });

    expect(res.status).not.toBe(403);
    expect([200, 201]).toContain(res.status);
    expect(repo.bulkUpsertSpy).toHaveBeenCalledTimes(1);
  });

  it('GET /api/chat/art-keywords UNCHANGED — visitor token still 200 (read-public-ish, design §3.4)', async () => {
    const res = await request(app)
      .get('/api/chat/art-keywords?locale=fr')
      .set('Authorization', `Bearer ${visitorToken()}`);

    // GET stays `isAuthenticated` only ; visitor MUST NOT be 403'd on reads.
    expect(res.status).not.toBe(403);
  });
});
