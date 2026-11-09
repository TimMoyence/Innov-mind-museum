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

const buildApp = (repo: ArtKeywordRepository): express.Express => {
  const app = express();
  app.use(express.json());
  const chatService = {} as ChatService;
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

    expect(res.status).not.toBe(403);
  });
});
