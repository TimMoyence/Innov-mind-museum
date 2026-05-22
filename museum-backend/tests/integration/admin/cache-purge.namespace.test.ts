/**
 * I-FIX1 Vague C — POST /api/admin/museums/:id/cache/purge MUST invalidate the
 * REAL namespace `llm:v2:{museum-mode|personalized}:{museumId}:*` (the layout
 * actually written by `LlmCacheServiceImpl.buildKey` — see
 * `llm-cache.service.ts:110-115`), NOT the dead `chat:llm:{museumId}:`
 * prefix that the route currently uses (`cache-purge.route.ts:25`).
 *
 * Spec : `team-state/2026-05-21-p0-feature-gates/spec.md` R-IFIX1a / R-IFIX1b +
 * `design.md` §3 Vague C I-FIX1 (D4 — wire the button onto `invalidateMuseum`).
 *
 * Baseline (HEAD `89d2d7b44`) :
 *   - `cache-purge.route.ts:25` : `await cache.delByPrefix('chat:llm:${id}:')`
 *     — this prefix matches 0 production cache entry.
 *   - `LlmCacheServiceImpl.invalidateMuseum` (`llm-cache.service.ts:77-94`)
 *     iterates `['museum-mode','personalized']` with the correct prefix
 *     `llm:v2:{ctx}:{museumId}:` — but it is DEAD CODE (0 caller in prod,
 *     grep-confirmed in spec § Table de triage I-FIX1).
 *   - Consequence : an admin editing a museum + clicking "purge" sees no
 *     invalidation ; stale answers persist up to 24h (museum-mode TTL).
 *
 * Acceptance (R-IFIX1a / R-IFIX1b) :
 *   - Seed real LLM cache entries under `llm:v2:museum-mode:42:anon:<sha>` AND
 *     `llm:v2:personalized:42:anon:<sha>` via the `LlmCacheServiceImpl.store`
 *     contract (so the keys match the real write path byte-for-byte — no
 *     hand-rolled key string that could drift from the service layout).
 *   - POST /api/admin/museums/42/cache/purge as admin.
 *   - Assert : both seeded keys are GONE from the cache (lookup miss via
 *     `service.lookup()` — same byte-for-byte derivation).
 *   - Assert : `delByPrefix` was called with `llm:v2:museum-mode:42:` AND
 *     `llm:v2:personalized:42:` (spy on the underlying cache).
 *   - Assert : `delByPrefix` was NOT called with the legacy `chat:llm:42:`
 *     prefix (regression guard against the dead namespace).
 *   - Also lock museum-id boundary : a cache entry seeded for museum 99 MUST
 *     SURVIVE a purge of museum 42 (no cross-museum collateral).
 *
 * Why "integration" location (no Postgres testcontainer needed) :
 *   The router under test depends ONLY on the cache layer (no DB, no LLM, no
 *   session repo). The `MemoryCacheService` is a faithful production
 *   implementation of `CacheService` (real `delByPrefix` iterates the real
 *   key store) — the same `delByPrefix` semantics the Redis adapter
 *   implements via `KEYS` scan in prod. We mirror the pattern used by
 *   `tests/integration/admin/admin-museum-cache-invalidation.integration.test.ts`
 *   (which lives under `tests/integration/admin/` without a testcontainer for
 *   the exact same reason — the cache contract is the unit under test, not
 *   the SQL layer). This avoids the heavy Postgres harness boot for a test
 *   that exercises pure cache + Express routing.
 *
 * Test discipline (CLAUDE.md §Test Discipline) :
 *   No inline entity creation. Auth tokens come from the shared
 *   `tests/helpers/auth/token.helpers` (`adminToken()`). Cache inputs are
 *   value objects (not entities) so the no-inline-entity rule does not apply.
 *   `auditService.log` mocked to a no-op (same pattern as the existing
 *   `tests/unit/routes/cache-purge.route.test.ts`).
 */

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

/**
 * Wrap a real `MemoryCacheService` so that we can both (a) observe ALL
 * `delByPrefix` calls (regression guard against the legacy `chat:llm:` prefix
 * AND positive assertion on the v2 prefixes) and (b) keep the real key store
 * semantics for the seed-then-miss assertion. We do NOT replace `delByPrefix`
 * — the spy passes through to the real implementation. This is critical : a
 * pure mock would assert "called with X" but never actually remove the keys,
 * masking the failure mode where the route calls `delByPrefix` with the WRONG
 * prefix and the cache silently keeps the entries.
 */
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

// Seed entries via the SAME service the production write path uses, so the
// keys land at the exact byte-identical layout that any future bump to
// KEY_VERSION or layout would invalidate (round-trip pin, same intent as
// `admin-museum-cache-invalidation.integration.test.ts:71-118`).
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

describe('I-FIX1 — POST /admin/museums/:id/cache/purge invalidates llm:v2:* namespace (R-IFIX1)', () => {
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

    // Sanity : both entries are present BEFORE the purge.
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

    // R-IFIX1a — after the purge, both seeded entries must miss. At baseline
    // the route purges `chat:llm:42:` (matches 0 key) → both lookups still
    // hit → assertion fails → RED.
    const postMuseumMode = await lookupService.lookup<typeof museumMode.payload>(museumMode.input);
    const postPersonalized = await lookupService.lookup<typeof personalized.payload>(
      personalized.input,
    );
    expect(postMuseumMode.hit).toBe(false);
    expect(postPersonalized.hit).toBe(false);
  });

  it('R-IFIX1a — delByPrefix is called with BOTH llm:v2:museum-mode:42: AND llm:v2:personalized:42: (correct namespace)', async () => {
    const { cache, delByPrefixSpy } = wrapCacheWithSpy(memory);

    await seedMuseumEntry(cache, 42, 'museum-mode', 'q1');
    await seedMuseumEntry(cache, 42, 'personalized', 'q2');
    // Clear the spy AFTER seeding so we only observe the purge calls (seeding
    // uses `store`, not `delByPrefix`, so this is belt-and-braces — but it
    // makes the assertions on call args robust against any future change to
    // the seed path that might issue a stray invalidation).
    delByPrefixSpy.mockClear();

    const app = buildApp(cache);
    const res = await request(app)
      .post('/api/admin/museums/42/cache/purge')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);

    const prefixCalls = delByPrefixSpy.mock.calls.map((call) => call[0]);
    expect(prefixCalls).toEqual(expect.arrayContaining(['llm:v2:museum-mode:42:']));
    expect(prefixCalls).toEqual(expect.arrayContaining(['llm:v2:personalized:42:']));
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
    // At baseline the route calls EXACTLY `chat:llm:42:` → assertion fails → RED.
    // Green : the route delegates to `invalidateMuseum` which never emits this prefix.
    expect(prefixCalls).not.toEqual(expect.arrayContaining(['chat:llm:42:']));
    // Defence-in-depth : no `chat:llm:*` prefix at all.
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

    // Museum 99 entry must still be in the cache — the purge for 42 is
    // strictly scoped. Green : `invalidateMuseum(42)` uses
    // `llm:v2:museum-mode:42:` (note the trailing colon — boundary char) and
    // does not match `llm:v2:museum-mode:99:`. RED at baseline trivially
    // passes (the wrong prefix removes nothing), but this assertion stays
    // green during the green phase too — it's a non-regression boundary lock.
    const postSurvivor = await lookupService.lookup<typeof survivor.payload>(survivor.input);
    expect(postSurvivor.hit).toBe(true);
  });
});
