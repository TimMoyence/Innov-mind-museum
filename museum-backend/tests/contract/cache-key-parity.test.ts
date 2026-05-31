/**
 * Contract — LLM cache-key derivation parity (sentinel: cache-key-parity).
 *
 * Characterization test for `LlmCacheServiceImpl` (ADR-036, single LLM cache
 * layer). It locks the cache-key invariants that, if silently broken by a
 * future edit to `llm-cache.service.ts`, would cause either a permanent 0% hit
 * rate (read/write key drift) or cross-cohort cache poisoning (voice/audio-desc
 * cohorts sharing a cache line — the v1→v2 regression fix `d54552beb`).
 *
 * PRODUCTION CONSTRAINT (spec §4): this run NEVER edits
 * `museum-backend/src/modules/chat/useCase/llm/llm-cache.service.ts` nor
 * `llm-cache.types.ts`. If any assertion below fails against HEAD, the TEST is
 * wrong (re-spec) — NOT the service (UFR-013 honesty + UFR-017). The cache-key
 * derivation is the source of truth.
 *
 * Import surface (spec §5 purity / AC5): ONLY `LlmCacheServiceImpl`, the
 * `LlmCacheKeyInput` type, and the shared `makeCache` / `makeLlmCacheKeyInput`
 * fixtures. NO module barrel, NO integration harness — those eagerly wire
 * BullMQ/ioredis (CLAUDE.md §Stryker open-handles gotcha).
 *
 * it → R-id → spec/source mapping:
 *   R1  store-key === lookup-key                  (read/write parity)   → AC7
 *   R2  computeKey === store-key === lookup-key    (persistence stamp)  → AC7
 *   R3  key format llm:v2:{ctx}:{museum|none}:{user|anon}:{32-hex}      → AC8
 *   R4  museumId segment precedes userId segment   (buildKey :130)      → AC8
 *   R5  invalidateMuseum prefix string-prefixes stored keys (:98-100)   → AC10
 *   R6  key independent of input field-insertion order (:168-171)       → AC10
 *   R7  voiceMode:true differs; voiceMode:false folds to base (:155-157)→ AC9
 *   R8  audioDescriptionMode:true differs; false folds (:152-154)        → AC9
 *   R9  base === {voiceMode:false, audioDescriptionMode:false}           → AC9
 *   R10 defaults museumId→none, userId→anon (buildKey :127-128)          → AC8
 *   R11 computeKey deterministic + pure (no cache I/O) (computeKey :47)  → AC3
 */
import { LlmCacheServiceImpl } from '@modules/chat/useCase/llm/llm-cache.service';

import { makeCache, makeLlmCacheKeyInput } from '../helpers/chat/cache.fixtures';

import type { LlmCacheKeyInput } from '@modules/chat/useCase/llm/llm-cache.types';

describe('cache-key parity contract (sentinel: cache-key-parity)', () => {
  let cache: ReturnType<typeof makeCache>;
  let service: LlmCacheServiceImpl;

  beforeEach(() => {
    cache = makeCache();
    service = new LlmCacheServiceImpl(cache);
  });

  // ── R1 — read/write parity ────────────────────────────────────────────
  it('R1 — store-key === lookup-key (read/write parity)', async () => {
    const input = makeLlmCacheKeyInput();

    await service.store(input, { text: 'v' });
    await service.lookup<{ text: string }>(input);

    const writtenKey = cache.set.mock.calls[0][0];
    const readKey = cache.get.mock.calls[0][0];

    expect(writtenKey).toBe(readKey);
  });

  // ── R2 — persistence-stamp parity ─────────────────────────────────────
  it('R2 — computeKey === store-key === lookup-key (persistence-stamp parity)', async () => {
    const input = makeLlmCacheKeyInput();

    const stamped = service.computeKey(input);
    await service.store(input, { text: 'v' });
    await service.lookup<{ text: string }>(input);

    const writtenKey = cache.set.mock.calls[0][0];
    const readKey = cache.get.mock.calls[0][0];

    expect(stamped).toBe(writtenKey);
    expect(stamped).toBe(readKey);
  });

  // ── R3 — exact key format ─────────────────────────────────────────────
  it('R3 — key matches llm:v2:{ctx}:{museum|none}:{user|anon}:{32-lowercase-hex}', () => {
    const key = service.computeKey(makeLlmCacheKeyInput());

    expect(key).toMatch(
      /^llm:v2:(generic|museum-mode|personalized):(\d+|none):(\d+|anon):[0-9a-f]{32}$/,
    );
  });

  // ── R4 — segment order (museumId BEFORE userId) ───────────────────────
  it('R4 — museumId segment precedes userId segment', () => {
    const key = service.computeKey(
      makeLlmCacheKeyInput({ museumContext: { museumId: 42, museumName: 'X' }, userId: 7 }),
    );

    const parts = key.split(':');
    // ['llm','v2',<ctx>,<museumId>,<userId>,<hash>]
    expect(parts[3]).toBe('42');
    expect(parts[4]).toBe('7');
  });

  // ── R10 — defaults none/anon ──────────────────────────────────────────
  it('R10 — defaults: museumId→none, userId→anon', () => {
    const key = service.computeKey(makeLlmCacheKeyInput());

    const parts = key.split(':');
    expect(parts[3]).toBe('none');
    expect(parts[4]).toBe('anon');
  });

  // ── R5 — invalidation prefix string-prefixes stored keys ──────────────
  it('R5 — invalidateMuseum prefix string-prefixes stored museum + personalized keys', async () => {
    const museumInput = makeLlmCacheKeyInput({
      museumContext: { museumId: 42, museumName: 'X' },
    });
    const persoInput = makeLlmCacheKeyInput({
      museumContext: { museumId: 42, museumName: 'X' },
      userPreferencesHash: 'h',
    });

    await service.store(museumInput, { text: 'm' });
    await service.store(persoInput, { text: 'p' });
    await service.invalidateMuseum(42);

    const museumKey = cache.set.mock.calls[0][0];
    const persoKey = cache.set.mock.calls[1][0];
    const prefixes = cache.delByPrefix.mock.calls.map((c) => c[0]);

    expect(prefixes.some((p) => museumKey.startsWith(p))).toBe(true);
    expect(prefixes.some((p) => persoKey.startsWith(p))).toBe(true);
  });

  // ── R6 — order-independence ───────────────────────────────────────────
  it('R6 — key is independent of input field-insertion order', () => {
    const a = makeLlmCacheKeyInput({ userId: 7 });
    // `b` intentionally declares the SAME fields/values as `a` in a DIFFERENT
    // order — its raison d'être is to differ structurally from the factory
    // output, exercising the sorted-JSON canonicalization (buildKey :168-171).
    const b: LlmCacheKeyInput = {
      userId: 7,
      prompt: a.prompt,
      locale: a.locale,
      systemSection: a.systemSection,
      model: a.model,
    };

    expect(service.computeKey(a)).toBe(service.computeKey(b));
  });

  // ── R7 — voiceMode two-way fold ───────────────────────────────────────
  it('R7 — voiceMode:true differs from base; voiceMode:false folds to base', () => {
    const base = makeLlmCacheKeyInput();
    const keyBase = service.computeKey(base);

    expect(service.computeKey({ ...base, voiceMode: true })).not.toBe(keyBase);
    expect(service.computeKey({ ...base, voiceMode: false })).toBe(keyBase);
  });

  // ── R8 — audioDescriptionMode two-way fold ────────────────────────────
  it('R8 — audioDescriptionMode:true differs from base; false folds to base', () => {
    const base = makeLlmCacheKeyInput();
    const keyBase = service.computeKey(base);

    expect(service.computeKey({ ...base, audioDescriptionMode: true })).not.toBe(keyBase);
    expect(service.computeKey({ ...base, audioDescriptionMode: false })).toBe(keyBase);
  });

  // ── R9 — combined backward-compat ─────────────────────────────────────
  it('R9 — base === {voiceMode:false, audioDescriptionMode:false} (truthy-only backward-compat)', () => {
    const base = makeLlmCacheKeyInput();

    expect(service.computeKey(base)).toBe(
      service.computeKey({ ...base, voiceMode: false, audioDescriptionMode: false }),
    );
  });

  // ── R11 — determinism + purity ────────────────────────────────────────
  it('R11 — computeKey is deterministic and pure (no cache I/O)', () => {
    const input = makeLlmCacheKeyInput();

    const k1 = service.computeKey(input);
    const k2 = service.computeKey(input);

    expect(k1).toBe(k2);
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
    expect(cache.delByPrefix).not.toHaveBeenCalled();
  });
});
