import express from 'express';
import request from 'supertest';

import { createCachePurgeRouter } from '@modules/admin/adapters/primary/http/routes/cache-purge.route';
import { LlmCacheServiceImpl } from '@modules/chat/useCase/llm/llm-cache.service';
import { MemoryCacheService } from '@shared/cache/memory-cache.service';
import { errorHandler } from '@shared/middleware/error.middleware';

import { adminToken } from '../../helpers/auth/token.helpers';

import type { CacheService } from '@shared/cache/cache.port';
import type { LlmCacheKeyInput } from '@modules/chat/useCase/llm/llm-cache.types';

jest.mock('@shared/audit', () => ({
  auditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@shared/logger/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const wrapCacheWithSpy = (
  inner: CacheService,
): { cache: CacheService; delByPrefixSpy: jest.Mock<Promise<void>, [string]> } => {
  const delByPrefixSpy = jest.fn(async (prefix: string): Promise<void> => {
    await inner.delByPrefix(prefix);
  });
  const cache: CacheService = {
    get: inner.get.bind(inner),
    set: inner.set.bind(inner),
    del: inner.del.bind(inner),
    delByPrefix: delByPrefixSpy as unknown as CacheService['delByPrefix'],
    setNx: inner.setNx.bind(inner),
    incrBy: inner.incrBy.bind(inner),
    ping: inner.ping.bind(inner),
    zadd: inner.zadd.bind(inner),
    ztop: inner.ztop.bind(inner),
  };
  return { cache, delByPrefixSpy };
};

const buildApp = (cache: CacheService) => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', createCachePurgeRouter(cache));
  app.use(errorHandler);
  return app;
};

const seedMuseumEntry = async (
  cache: CacheService,
  museumId: number,
  variant: 'museum-mode' | 'personalized',
  uniqPrompt: string,
): Promise<{ input: LlmCacheKeyInput; payload: { text: string } }> => {
  const service = new LlmCacheServiceImpl(cache);
  const input: LlmCacheKeyInput =
    variant === 'museum-mode'
      ? {
          model: 'gpt-4o-mini',
          userId: 'anon',
          systemSection: 'chat-default',
          locale: 'fr',
          prompt: uniqPrompt,
          museumContext: { museumId, museumName: `Museum-${String(museumId)}` },
        }
      : {
          model: 'gpt-4o-mini',
          userId: 'anon',
          systemSection: 'chat-default',
          locale: 'fr',
          prompt: uniqPrompt,
          museumContext: { museumId, museumName: `Museum-${String(museumId)}` },
          userPreferencesHash: `prefs-${String(museumId)}`,
        };
  const payload = { text: `seeded:${variant}:${String(museumId)}` };
  await service.store(input, payload);
  return { input, payload };
};

describe('I-FIX1 — POST /admin/museums/:id/cache/purge invalidates llm:v4:* namespace (R-IFIX1)', () => {
  let memory: MemoryCacheService;

  beforeEach(() => {
    memory = new MemoryCacheService();
  });

  afterEach(async () => {
    await memory.destroy();
  });

  it('R-IFIX1a — seeded museum-mode + personalized entries for museum 42 are GONE after purge (lookup miss)', async () => {
    const { cache } = wrapCacheWithSpy(memory);
    const lookupService = new LlmCacheServiceImpl(cache);

    const museumMode = await seedMuseumEntry(cache, 42, 'museum-mode', 'q1-museum-mode');
    const personalized = await seedMuseumEntry(cache, 42, 'personalized', 'q2-personalized');

    const preMuseumMode = await lookupService.lookup<typeof museumMode.payload>(museumMode.input);
    const prePersonalized = await lookupService.lookup<typeof personalized.payload>(
      personalized.input,
    );
    expect(preMuseumMode.hit).toBe(true);
    expect(prePersonalized.hit).toBe(true);

    const app = buildApp(cache);
    const res = await request(app)
      .post('/api/admin/museums/42/cache/purge')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);

    const postMuseumMode = await lookupService.lookup<typeof museumMode.payload>(museumMode.input);
    const postPersonalized = await lookupService.lookup<typeof personalized.payload>(
      personalized.input,
    );
    expect(postMuseumMode.hit).toBe(false);
    expect(postPersonalized.hit).toBe(false);
  });

  it('R-IFIX1a — delByPrefix is called with BOTH llm:v4:museum-mode:42: AND llm:v4:personalized:42: (correct namespace)', async () => {
    const { cache, delByPrefixSpy } = wrapCacheWithSpy(memory);

    await seedMuseumEntry(cache, 42, 'museum-mode', 'q1');
    await seedMuseumEntry(cache, 42, 'personalized', 'q2');
    delByPrefixSpy.mockClear();

    const app = buildApp(cache);
    const res = await request(app)
      .post('/api/admin/museums/42/cache/purge')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);

    const prefixCalls = delByPrefixSpy.mock.calls.map((call) => call[0]);
    expect(prefixCalls).toEqual(expect.arrayContaining(['llm:v4:museum-mode:42:']));
    expect(prefixCalls).toEqual(expect.arrayContaining(['llm:v4:personalized:42:']));
  });

  it('R-IFIX1a — delByPrefix is NOT called with the legacy chat:llm:42: prefix (regression guard against the dead namespace)', async () => {
    const { cache, delByPrefixSpy } = wrapCacheWithSpy(memory);

    delByPrefixSpy.mockClear();

    const app = buildApp(cache);
    const res = await request(app)
      .post('/api/admin/museums/42/cache/purge')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);

    const prefixCalls = delByPrefixSpy.mock.calls.map((call) => call[0]);
    expect(prefixCalls).not.toEqual(expect.arrayContaining(['chat:llm:42:']));
    for (const prefix of prefixCalls) {
      expect(prefix.startsWith('chat:llm:')).toBe(false);
    }
  });

  it('R-IFIX1a boundary — entries for museum 99 SURVIVE a purge of museum 42 (no cross-museum collateral)', async () => {
    const { cache } = wrapCacheWithSpy(memory);
    const lookupService = new LlmCacheServiceImpl(cache);

    const survivor = await seedMuseumEntry(cache, 99, 'museum-mode', 'museum-99-prompt');
    await seedMuseumEntry(cache, 42, 'museum-mode', 'museum-42-prompt');

    const app = buildApp(cache);
    const res = await request(app)
      .post('/api/admin/museums/42/cache/purge')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);

    const postSurvivor = await lookupService.lookup<typeof survivor.payload>(survivor.input);
    expect(postSurvivor.hit).toBe(true);
  });
});
