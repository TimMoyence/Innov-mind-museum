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
    for (let i = 0; i < 15; i += 1) {
      const res = await request(app)
        .get('/api/chat/art-keywords?locale=fr')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).not.toBe(429);
    }
  });
});
