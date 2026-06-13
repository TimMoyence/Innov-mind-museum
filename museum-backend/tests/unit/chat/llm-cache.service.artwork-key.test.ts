/**
 * I-FIX2 Vague C — LLM cache key MUST fold `currentArtworkKey` so that two
 * chat requests sharing museumId/prompt/locale/user but pointing at different
 * artworks produce DIFFERENT cache keys.
 *
 * Spec : `team-state/2026-05-21-p0-feature-gates/spec.md` R-IFIX2 +
 * `design.md` §3 Vague C I-FIX2 (D5).
 *
 * Baseline (HEAD `89d2d7b44`) :
 *   `LlmCacheKeyInput` (`llm-cache.types.ts:4-34`) has NO `currentArtworkKey`
 *   field. `sha256OfCanonicalInput` (`llm-cache.service.ts:118-148`) folds
 *   `model`, `systemSection`, `locale`, `museumName`, `userPreferencesHash`,
 *   `prompt`, then truthy-only `imageContentHash` / `audioDescriptionMode` /
 *   `voiceMode`. There is no path through which the current artwork identity
 *   influences the hash, so two visitors in the same museum asking the same
 *   prompt about two different artworks share a cache entry (cross-talk).
 *
 * Acceptance (R-IFIX2 / D5) :
 *   1. Two `LlmCacheKeyInput` identical except `currentArtworkKey` ('A' vs 'B')
 *      → different sha256 of canonical input.
 *   2. Input with `currentArtworkKey: undefined` → hash byte-identical to a
 *      legacy input of the same shape (no-regression on legacy entries — mirror
 *      of the `imageContentHash` / `voiceMode` truthy-only contract).
 *   3. Truthy-only fold : `currentArtworkKey: ''` (empty string) MUST produce
 *      the same hash as `undefined` / omitted, byte-identical to the legacy
 *      snapshot. Only TRUTHY values participate in the canonical JSON.
 *
 * These tests MUST FAIL at baseline :
 *   - TypeScript : `currentArtworkKey` is not assignable to `LlmCacheKeyInput`
 *     so the spread `{ ...baseInput, currentArtworkKey: 'A' }` raises TS2353
 *     (excess property check via the typed local). The test does NOT cast to
 *     `any` — the type error IS the red signal.
 *   - Even if you bypass the type check (via the casted helper used here so
 *     that the suite RUNS instead of failing to compile), the runtime hash
 *     ignores the unknown field → Test 1 asserts the two hashes differ → FAIL
 *     (they're equal at baseline). Test 2/3 byte-identity asserts pass
 *     trivially today (because the field is invisible), but they LOCK the
 *     legacy-compat contract for the green phase implementation so a future
 *     refactor that bumps KEY_VERSION or folds the field unconditionally
 *     trips a clear failure.
 *
 * Pattern : mirrors `tests/unit/chat/c3-llm-cache.test.ts` (R6-R10 cache key
 * derivation tests). No new shared factory introduced ; the input objects are
 * plain literals matching the `LlmCacheKeyInput` shape (NOT entity types — the
 * test-discipline "no inline entity" rule does not apply to value objects /
 * cache key inputs).
 */

import { LlmCacheServiceImpl } from '@modules/chat/useCase/llm/llm-cache.service';

import type { CacheService } from '@shared/cache/cache.port';
import type { LlmCacheKeyInput } from '@modules/chat/useCase/llm/llm-cache.types';

jest.mock('@shared/logger/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const buildMockCache = (): jest.Mocked<CacheService> =>
  ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    delByPrefix: jest.fn(),
    setNx: jest.fn(),
    ping: jest.fn(),
    zadd: jest.fn(),
  }) as unknown as jest.Mocked<CacheService>;

const baseInput: LlmCacheKeyInput = {
  model: 'gpt-4o-mini',
  userId: 'anon',
  systemSection: 'chat-default',
  locale: 'fr',
  prompt: 'Tell me about this painting',
  museumContext: { museumId: 42, museumName: 'Aquitaine' },
};

/**
 * Test-only helper : build an input with a possibly-extra `currentArtworkKey`
 * field. Baseline types do NOT include this field, so the helper accepts a
 * superset shape. Once the green phase extends `LlmCacheKeyInput`, this helper
 * becomes a thin pass-through (the green phase MAY simplify it but must not
 * change the test BODY — frozen-test contract).
 *
 * IMPORTANT : we cast through `unknown` (NOT `any`) so the call site stays
 * typed at the boundary. The cast is contained here, contract-documented, and
 * narrowly scoped so the BODY of each test stays declarative.
 * @param base
 * @param currentArtworkKey
 */
const inputWithArtwork = (
  base: LlmCacheKeyInput,
  currentArtworkKey: string | undefined,
): LlmCacheKeyInput => ({ ...base, currentArtworkKey }) as unknown as LlmCacheKeyInput;

/**
 * Capture the cache key (full string) issued by the service for a given input.
 * Uses `store` because the mock records the key as the first arg to `cache.set`.
 * Returns just the trailing sha256 hex (32 chars) — the part that depends on
 * the canonical input contents (the prefix part `llm:v3:{ctx}:{museumId}:{userId}:`
 * is structural and stable across these tests since we hold museumId/userId
 * constant).
 * @param service
 * @param cache
 * @param input
 */
const hashFromStoredKey = async (
  service: LlmCacheServiceImpl,
  cache: jest.Mocked<CacheService>,
  input: LlmCacheKeyInput,
): Promise<string> => {
  cache.set.mockClear();
  await service.store(input, { text: 'sentinel' });
  const lastCall = cache.set.mock.calls.at(-1);
  if (!lastCall) {
    throw new Error('cache.set was not called — service.store contract changed');
  }
  const key = String(lastCall[0]);
  // Pattern : `llm:v3:{contextClass}:{museumIdOrNone}:{userIdOrAnon}:{sha256}`
  // (KEY_VERSION bumped v2→v3 on 2026-06-12 for the lowDataMode dimension —
  // US-12.2/INV-21, run undefined-network-detection-reliability.)
  const match = /^llm:v3:[a-z-]+:[0-9a-z-]+:[0-9a-z-]+:([0-9a-f]{32})$/.exec(key);
  if (!match) {
    throw new Error(`cache key shape unexpected : ${key}`);
  }
  return match[1];
};

describe('I-FIX2 — LlmCacheServiceImpl folds currentArtworkKey (R-IFIX2)', () => {
  // Golden snapshot : compute the legacy hash (no currentArtworkKey field at
  // all) ONCE at suite startup. This is the byte-identity reference for
  // backward-compat assertions (Tests 2 & 3). Captured at runtime so the
  // snapshot is intrinsically pinned to the current canonical JSON shape ;
  // any future change to `sha256OfCanonicalInput` that affects legacy inputs
  // (e.g. adding a field unconditionally) will flip this snapshot AND the
  // byte-identity tests in the same run — visible single root cause.
  let legacyHashSnapshot: string;

  beforeAll(async () => {
    const cache = buildMockCache();
    const service = new LlmCacheServiceImpl(cache);
    legacyHashSnapshot = await hashFromStoredKey(service, cache, baseInput);
  });

  it('Test 1 — two inputs differing ONLY by currentArtworkKey produce DIFFERENT cache keys (R-IFIX2 core)', async () => {
    const cache = buildMockCache();
    const service = new LlmCacheServiceImpl(cache);

    const hashA = await hashFromStoredKey(service, cache, inputWithArtwork(baseInput, 'A'));
    const hashB = await hashFromStoredKey(service, cache, inputWithArtwork(baseInput, 'B'));

    // RED at baseline : currentArtworkKey is not folded → hashA === hashB
    // (both equal to legacyHashSnapshot). Green : the canonical input embeds
    // the artwork key → hashA !== hashB → 2 visitors see distinct cache lines.
    expect(hashA).not.toBe(hashB);
  });

  it('Test 2 — input with currentArtworkKey:undefined produces a hash BYTE-IDENTICAL to the legacy snapshot (no-regression, R-IFIX2 R8/AC6-mirror)', async () => {
    const cache = buildMockCache();
    const service = new LlmCacheServiceImpl(cache);

    const hashUndef = await hashFromStoredKey(
      service,
      cache,
      inputWithArtwork(baseInput, undefined),
    );

    // R-IFIX2 backward-compat : truthy-only fold means undefined → field
    // absent from canonical JSON → byte-identical to legacy. Mirror of the
    // `imageContentHash` (R8/AC6) and `voiceMode` / `audioDescriptionMode` (F1)
    // contracts already locked in this codebase.
    expect(hashUndef).toBe(legacyHashSnapshot);
  });

  it('Test 3 — truthy-only fold : currentArtworkKey === "" (empty string) produces the SAME hash as undefined, byte-identical to legacy snapshot', async () => {
    const cache = buildMockCache();
    const service = new LlmCacheServiceImpl(cache);

    const hashEmpty = await hashFromStoredKey(service, cache, inputWithArtwork(baseInput, ''));
    const hashUndef = await hashFromStoredKey(
      service,
      cache,
      inputWithArtwork(baseInput, undefined),
    );

    // Truthy-only contract : empty string is falsy → MUST be folded out, same
    // as undefined / omitted. Prevents an empty-string artwork id from
    // partitioning the cache vs the no-artwork text-only path.
    expect(hashEmpty).toBe(hashUndef);
    expect(hashEmpty).toBe(legacyHashSnapshot);
  });
});
