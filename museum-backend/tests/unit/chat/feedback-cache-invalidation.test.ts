/**
 * RED-phase (UFR-022 / PR-P0-1) — non-tautological feedback-cache-invalidation suite.
 *
 * What the previous suite did wrong:
 *   It computed the "expected key" by calling `buildCacheKey()` — the SAME function
 *   chained into `invalidateCacheForFeedback` via `buildFeedbackInvalidationKeys`.
 *   `chat:llm:*` strings on both sides matched, the test went green, and the prod
 *   bug (`LlmCacheServiceImpl` writes under `llm:v2:*` — a DIFFERENT namespace —
 *   so the feedback path purges 0 real entries) remained invisible.
 *
 * What this suite does instead:
 *   - Builds an in-memory `CacheService` whose backing `Map<string, unknown>` is
 *     accessible to the test (so we can read the byte-string key actually inserted).
 *   - Wraps a REAL `LlmCacheServiceImpl(memCache)` and calls `await llmCache.store(...)`.
 *     The key that hits `memCache._map` is the SAME key the prod write path emits.
 *   - Captures that key from `Array.from(memCache._map.keys())` AFTER `store()` —
 *     never recomputed by re-invoking the function under test.
 *   - Stamps the captured key on the assistant `ChatMessage` row (mocked repo) and
 *     posts negative feedback through `ChatMediaService.setMessageFeedback`.
 *   - Asserts the captured key is GONE from `memCache._map` after the feedback call.
 *
 * Why this fails RED today:
 *   The current `invalidateCacheForFeedback` (museum-backend/src/modules/chat/
 *   useCase/audio/chat-media.service.ts:169-185) calls `buildFeedbackInvalidationKeys`
 *   which emits `chat:llm:*` keys via `buildCacheKey()`. None of those keys are the
 *   `llm:v2:*` key written by `LlmCacheServiceImpl.store()`, so `cache.del(...)`
 *   targets ghosts and the real entry stays alive → `memCache.has(realKey) === true`
 *   after feedback → the new R1 assertion fails. The R4 (legacy null) and R3
 *   (fail-open WARN log shape) assertions also fail today because those code paths
 *   simply don't exist yet.
 *
 * Coverage of LLM cache contexts (spec R8 / AC7 multi-context table):
 *   - generic       → museumContext absent, userPreferencesHash absent
 *   - museum-mode   → museumContext.museumId set, no userPreferencesHash
 *   - personalized  → userPreferencesHash set
 *   `LlmCacheServiceImpl.classify` (llm-cache.service.ts:25) is what routes between
 *   them; the key prefix differs (`llm:v2:generic:*` vs `llm:v2:museum-mode:*` vs
 *   `llm:v2:personalized:*`). Table-driven coverage below.
 */

import { ChatMediaService } from '@modules/chat/useCase/audio/chat-media.service';
import { LlmCacheServiceImpl } from '@modules/chat/useCase/llm/llm-cache.service';
import type { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import type { ChatSession } from '@modules/chat/domain/session/chatSession.entity';
import type { ChatMessageWithSessionOwnership } from '@modules/chat/domain/session/chat.repository.interface';
import type { LlmCacheKeyInput } from '@modules/chat/useCase/llm/llm-cache.types';
import type { CacheService } from '@shared/cache/cache.port';
import { makeSession, makeMessage, makeSessionUser } from '../../helpers/chat/message.fixtures';
import { makeChatRepo } from '../../helpers/chat/repo.fixtures';

// Silence logger output during tests AND capture the calls for shape assertions.
const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
jest.mock('@shared/logger/logger', () => ({
  logger: {
    info: (...args: unknown[]) => loggerMock.info(...args),
    warn: (...args: unknown[]) => loggerMock.warn(...args),
    error: (...args: unknown[]) => loggerMock.error(...args),
  },
}));

// Silence prom metrics (LlmCacheServiceImpl pings counters on lookup paths).
jest.mock('@shared/observability/prometheus-metrics', () => ({
  llmCacheHitsTotal: { inc: jest.fn() },
  llmCacheMissesTotal: { inc: jest.fn() },
}));

// ---------------------------------------------------------------------------
// MemoryCacheService — Map-backed test double. The Map is exposed via the
// readonly `store` accessor so the test can read the byte-string key the
// production write path actually used.
// ---------------------------------------------------------------------------

class MemoryCacheService implements CacheService {
  /** Public-to-the-test view of the backing Map. Do NOT mutate from tests; just inspect. */
  public readonly store = new Map<string, unknown>();
  /** del call log for R2 / R4 assertions. */
  public readonly delCalls: string[] = [];
  /** Optional throw injector for fail-open R3 path. */
  public delThrows: Error | null = null;

  async get<T>(key: string): Promise<T | null> {
    return (this.store.get(key) as T | undefined) ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }

  async del(key: string): Promise<void> {
    this.delCalls.push(key);
    if (this.delThrows) {
      throw this.delThrows;
    }
    this.store.delete(key);
  }

  async delByPrefix(prefix: string): Promise<void> {
    for (const k of Array.from(this.store.keys())) {
      if (k.startsWith(prefix)) {
        this.store.delete(k);
      }
    }
  }

  async setNx(): Promise<boolean> {
    return true;
  }

  async incrBy(): Promise<number | null> {
    return null;
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async zadd(): Promise<void> {
    /* noop */
  }

  async ztop(): Promise<{ member: string; score: number }[]> {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SESSION_ID = 'a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4';
const ASSISTANT_MSG_ID = 'b1b1b1b1-c2c2-4d3d-9e4e-f5f5f5f5f5f5';
const USER_MSG_ID = 'c2c2c2c2-d3d3-4e4e-af5f-060606060606';
const MUSEUM_ID = 7;
const USER_ID = 42;

/**
 * Wraps `makeMessage` to expose the `cacheKey` field expected by the green-phase
 * fix. Today the entity does NOT declare `cacheKey` (PR-P0-1 will add it as
 * `@Column({ type: 'text', nullable: true, name: 'cache_key' }) cacheKey?: string | null`).
 * The cast through `unknown` lets the test compile under both states — the assertion
 * below is what proves the column is read by the feedback path.
 */
type AssistantMessageWithCacheKey = ChatMessage & { cacheKey?: string | null };

const makeAssistantRow = (
  cacheKey: string | null,
  sessionOverrides: Partial<ChatSession> = {},
): ChatMessageWithSessionOwnership => {
  const session = makeSession({
    id: SESSION_ID,
    museumId: MUSEUM_ID,
    locale: 'fr',
    user: makeSessionUser(USER_ID),
    ...sessionOverrides,
  });
  const baseMessage = makeMessage({
    id: ASSISTANT_MSG_ID,
    role: 'assistant',
    text: "La Joconde est un chef-d'oeuvre",
    sessionId: SESSION_ID,
    session,
  });
  // Attach the cacheKey field that the green-phase fix will read at
  // `chat-media.service.ts::invalidateCacheForFeedback`. Cast through unknown
  // so the test compiles regardless of whether the entity already declares
  // the column.
  const message = Object.assign(baseMessage, { cacheKey }) as AssistantMessageWithCacheKey;
  return { message: message as ChatMessage, session };
};

const makeHistory = (userText: string): ChatMessage[] => [
  makeMessage({ id: USER_MSG_ID, role: 'user', text: userText, sessionId: SESSION_ID }),
  makeMessage({
    id: ASSISTANT_MSG_ID,
    role: 'assistant',
    text: "La Joconde est un chef-d'oeuvre",
    sessionId: SESSION_ID,
  }),
];

/**
 * Builds a baseline `LlmCacheKeyInput`. The CONTENTS are not the contract of this
 * test — what matters is that whatever `LlmCacheServiceImpl.store()` writes IS
 * what `invalidateCacheForFeedback` deletes. The variants below exercise the
 * three context classes.
 * @param variant
 */
const baselineInput = (variant: 'generic' | 'museum-mode' | 'personalized'): LlmCacheKeyInput => {
  const base: LlmCacheKeyInput = {
    model: 'gpt-4o-mini',
    userId: USER_ID,
    systemSection: 'chat-default',
    locale: 'fr',
    prompt: 'Qui a peint la Joconde ?',
  };
  if (variant === 'museum-mode') {
    return {
      ...base,
      museumContext: { museumId: MUSEUM_ID, museumName: 'Louvre' },
    };
  }
  if (variant === 'personalized') {
    return {
      ...base,
      museumContext: { museumId: MUSEUM_ID, museumName: 'Louvre' },
      userPreferencesHash: 'abc123userpref',
    };
  }
  // 'generic' — anon, no museum context
  return { ...base, userId: 'anon' };
};

/**
 * Writes `value` via the REAL `LlmCacheServiceImpl.store()` write path and
 * returns the byte-string key the cache observed. Critical contract: the
 * returned key is NOT computed by re-invoking the asserted function — it is
 * READ from the Map keys after the store.
 * @param llmCache
 * @param memCache
 * @param input
 * @param value
 */
async function storeAndCaptureKey(
  llmCache: LlmCacheServiceImpl,
  memCache: MemoryCacheService,
  input: LlmCacheKeyInput,
  value: unknown,
): Promise<string> {
  const before = new Set(memCache.store.keys());
  await llmCache.store(input, value);
  const afterKeys = Array.from(memCache.store.keys()).filter((k) => !before.has(k));
  if (afterKeys.length !== 1) {
    throw new Error(
      `storeAndCaptureKey expected exactly 1 new key, observed ${String(afterKeys.length)}: ${JSON.stringify(afterKeys)}`,
    );
  }
  return afterKeys[0];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Feedback cache invalidation (non-tautological, UFR-022 PR-P0-1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    loggerMock.info.mockClear();
    loggerMock.warn.mockClear();
    loggerMock.error.mockClear();
  });

  // ---------------------------------------------------------------------------
  // R1 / AC7 — table-driven across 3 contextClass values. Each iteration writes
  // a real entry via LlmCacheServiceImpl.store(), captures the REAL key from
  // the MemoryCacheService Map, stamps it on the assistant row, posts negative
  // feedback, and asserts the entry is gone from the Map.
  //
  // The "expected key" is captured from cache observation, NEVER recomputed
  // by re-invoking the production hash function — that is the structural
  // anti-tautology of this suite.
  // ---------------------------------------------------------------------------
  describe.each<['generic' | 'museum-mode' | 'personalized', string]>([
    ['generic', 'llm:v2:generic:'],
    ['museum-mode', 'llm:v2:museum-mode:'],
    ['personalized', 'llm:v2:personalized:'],
  ])(
    'purges the exact LlmCacheServiceImpl entry for contextClass=%s',
    (variant, expectedPrefix) => {
      it(`invalidates the real ${variant} key (captured from cache write path, not recomputed)`, async () => {
        const memCache = new MemoryCacheService();
        const llmCache = new LlmCacheServiceImpl(memCache);

        // Real write path — produces the byte-string key the prod system uses.
        const realKey = await storeAndCaptureKey(llmCache, memCache, baselineInput(variant), {
          text: 'cached llm response',
        });

        // Sanity: confirm prefix shape matches LlmCacheServiceImpl namespace
        // (this is a SHAPE check on the captured key, not a recomputation
        // — if this passes but the purge assertion below fails, the bug is
        // proven: the cache wrote under `llm:v2:*` but the feedback path
        // purges something else).
        expect(realKey.startsWith(expectedPrefix)).toBe(true);
        expect(memCache.store.has(realKey)).toBe(true);

        // Stamp the captured key on the assistant ChatMessage row. The
        // feedback path is supposed to read `row.message.cacheKey` and
        // pass it straight to `cache.del()`.
        const row = makeAssistantRow(realKey);
        const repo = makeChatRepo({
          getMessageById: jest.fn().mockResolvedValue(row),
          upsertMessageFeedback: jest.fn().mockResolvedValue(undefined),
          getMessageFeedback: jest.fn().mockResolvedValue(null),
          listSessionHistory: jest.fn().mockResolvedValue(makeHistory('Qui a peint la Joconde ?')),
        });

        const svc = new ChatMediaService({ repository: repo, cache: memCache });
        const result = await svc.setMessageFeedback(ASSISTANT_MSG_ID, USER_ID, 'negative');

        expect(result).toEqual({ messageId: ASSISTANT_MSG_ID, status: 'created' });

        // THE pivot assertion: the realKey is GONE from the cache. If the
        // feedback path purges some other namespace (the legacy `chat:llm:*`
        // cartesian bug), this fails — proving the P0.
        expect(memCache.store.has(realKey)).toBe(false);

        // Stronger form (anti-coincidence): the realKey appears in delCalls.
        expect(memCache.delCalls).toContain(realKey);
      });
    },
  );

  // ---------------------------------------------------------------------------
  // R2 / AC8 — positive feedback / toggle-off do NOT call cache.del at all.
  // ---------------------------------------------------------------------------
  it('does NOT call cache.del when positive feedback is submitted', async () => {
    const memCache = new MemoryCacheService();
    const llmCache = new LlmCacheServiceImpl(memCache);
    const realKey = await storeAndCaptureKey(llmCache, memCache, baselineInput('museum-mode'), {
      text: 'cached',
    });

    const row = makeAssistantRow(realKey);
    const repo = makeChatRepo({
      getMessageById: jest.fn().mockResolvedValue(row),
      upsertMessageFeedback: jest.fn().mockResolvedValue(undefined),
      getMessageFeedback: jest.fn().mockResolvedValue(null),
      listSessionHistory: jest.fn().mockResolvedValue(makeHistory('Qui a peint la Joconde ?')),
    });

    const svc = new ChatMediaService({ repository: repo, cache: memCache });
    const result = await svc.setMessageFeedback(ASSISTANT_MSG_ID, USER_ID, 'positive');

    expect(result).toEqual({ messageId: ASSISTANT_MSG_ID, status: 'created' });
    expect(memCache.delCalls).toEqual([]);
    expect(memCache.store.has(realKey)).toBe(true);
  });

  it('does NOT call cache.del when feedback toggle-off (same value re-submitted)', async () => {
    const memCache = new MemoryCacheService();
    const llmCache = new LlmCacheServiceImpl(memCache);
    const realKey = await storeAndCaptureKey(llmCache, memCache, baselineInput('museum-mode'), {
      text: 'cached',
    });

    const row = makeAssistantRow(realKey);
    const repo = makeChatRepo({
      getMessageById: jest.fn().mockResolvedValue(row),
      // Toggle-off scenario: there's already a negative feedback in the repo.
      getMessageFeedback: jest.fn().mockResolvedValue({ value: 'negative' }),
      deleteMessageFeedback: jest.fn().mockResolvedValue(undefined),
    });

    const svc = new ChatMediaService({ repository: repo, cache: memCache });
    const result = await svc.setMessageFeedback(ASSISTANT_MSG_ID, USER_ID, 'negative');

    expect(result).toEqual({ messageId: ASSISTANT_MSG_ID, status: 'removed' });
    expect(memCache.delCalls).toEqual([]);
    expect(memCache.store.has(realKey)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // R3 / AC9 — fail-open: cache.del throws → feedback HTTP 200 + WARN log.
  // ---------------------------------------------------------------------------
  it('returns success (fail-open) and emits llm_cache_invalidate_failed WARN when cache.del throws', async () => {
    const memCache = new MemoryCacheService();
    const llmCache = new LlmCacheServiceImpl(memCache);
    const realKey = await storeAndCaptureKey(llmCache, memCache, baselineInput('museum-mode'), {
      text: 'cached',
    });

    memCache.delThrows = new Error('Redis connection lost');

    const row = makeAssistantRow(realKey);
    const repo = makeChatRepo({
      getMessageById: jest.fn().mockResolvedValue(row),
      upsertMessageFeedback: jest.fn().mockResolvedValue(undefined),
      getMessageFeedback: jest.fn().mockResolvedValue(null),
      listSessionHistory: jest.fn().mockResolvedValue(makeHistory('Q?')),
    });

    const svc = new ChatMediaService({ repository: repo, cache: memCache });
    const result = await svc.setMessageFeedback(ASSISTANT_MSG_ID, USER_ID, 'negative');

    // Feedback must succeed even though cache.del threw.
    expect(result).toEqual({ messageId: ASSISTANT_MSG_ID, status: 'created' });
    expect(repo.upsertMessageFeedback).toHaveBeenCalledWith(ASSISTANT_MSG_ID, USER_ID, 'negative');

    // del was attempted on the REAL key (proves we hit the right namespace
    // before the throw).
    expect(memCache.delCalls).toContain(realKey);

    // WARN log emitted with the spec NFR-7 shape.
    expect(loggerMock.warn).toHaveBeenCalledWith(
      'llm_cache_invalidate_failed',
      expect.objectContaining({
        messageId: ASSISTANT_MSG_ID,
        key: realKey,
        error: expect.stringContaining('Redis connection lost'),
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // R4 / AC10 — legacy row with cacheKey=null → no cache.del + INFO skip log.
  // ---------------------------------------------------------------------------
  it('skips invalidation and emits llm_cache_invalidate_skipped INFO when message.cacheKey is null (legacy row)', async () => {
    const memCache = new MemoryCacheService();
    // Pre-populate the cache with some unrelated entry to prove nothing gets
    // wrongly purged when cacheKey is null on the row.
    const llmCache = new LlmCacheServiceImpl(memCache);
    const unrelatedKey = await storeAndCaptureKey(
      llmCache,
      memCache,
      baselineInput('museum-mode'),
      { text: 'unrelated cached' },
    );

    const row = makeAssistantRow(null); // legacy row — no cacheKey
    const repo = makeChatRepo({
      getMessageById: jest.fn().mockResolvedValue(row),
      upsertMessageFeedback: jest.fn().mockResolvedValue(undefined),
      getMessageFeedback: jest.fn().mockResolvedValue(null),
      listSessionHistory: jest.fn().mockResolvedValue(makeHistory('Some Q?')),
    });

    const svc = new ChatMediaService({ repository: repo, cache: memCache });
    const result = await svc.setMessageFeedback(ASSISTANT_MSG_ID, USER_ID, 'negative');

    expect(result).toEqual({ messageId: ASSISTANT_MSG_ID, status: 'created' });

    // No del attempted at all — neither the unrelated entry, nor anything else.
    expect(memCache.delCalls).toEqual([]);
    expect(memCache.store.has(unrelatedKey)).toBe(true);

    // INFO skip log with NFR-7 shape.
    expect(loggerMock.info).toHaveBeenCalledWith(
      'llm_cache_invalidate_skipped',
      expect.objectContaining({
        messageId: ASSISTANT_MSG_ID,
        reason: 'no_cache_key',
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // No cache injected — preserve existing early-return semantic.
  // ---------------------------------------------------------------------------
  it('does not throw when ChatMediaService is constructed without a cache (early return)', async () => {
    const row = makeAssistantRow('llm:v2:museum-mode:7:42:abcdef');
    const repo = makeChatRepo({
      getMessageById: jest.fn().mockResolvedValue(row),
      upsertMessageFeedback: jest.fn().mockResolvedValue(undefined),
      getMessageFeedback: jest.fn().mockResolvedValue(null),
      listSessionHistory: jest.fn().mockResolvedValue(makeHistory('Q?')),
    });

    const svc = new ChatMediaService({ repository: repo }); // no cache
    await expect(svc.setMessageFeedback(ASSISTANT_MSG_ID, USER_ID, 'negative')).resolves.toEqual({
      messageId: ASSISTANT_MSG_ID,
      status: 'created',
    });
  });
});
