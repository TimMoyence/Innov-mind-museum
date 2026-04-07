# Smart Low-Data Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared LLM response cache (Redis backend + Zustand frontend) with contextual pre-fetch and graceful degradation for museum visitors on slow/expensive networks.

**Architecture:** Decorator pattern — `CachingChatOrchestrator` wraps the existing `FallbackChatOrchestrator` via the `ChatOrchestrator` port. Frontend adds `DataModeProvider` (NetInfo auto-detect + user toggle) and `chatLocalCache` (Zustand persist). Pre-fetch via `GET /museums/:id/low-data-pack`. Cache invalidation via existing 👎 feedback hook.

**Tech Stack:** ioredis (existing), Zustand + persist (existing), @react-native-community/netinfo (existing via Expo), sha256 (crypto module backend, expo-crypto frontend)

**Spec:** `docs/superpowers/specs/2026-04-07-smart-low-data-mode-design.md`

---

## Milestone A — Cache Infrastructure Foundation

### Task 1: Extend CacheService port with `zadd` and `ztop`

**Files:**
- Modify: `museum-backend/src/shared/cache/cache.port.ts`
- Modify: `museum-backend/src/shared/cache/redis-cache.service.ts`
- Modify: `museum-backend/src/shared/cache/noop-cache.service.ts`
- Test: `museum-backend/tests/unit/cache/redis-cache-zadd-ztop.test.ts`

**Context:** The popularity tracking (sorted set) needs two new methods on the existing `CacheService` port. `zadd` increments a member's score in a Redis sorted set. `ztop` returns the top N members by score descending.

- [ ] **Step 1: Write failing tests for `zadd` and `ztop`**

Create `museum-backend/tests/unit/cache/redis-cache-zadd-ztop.test.ts`:

```typescript
import { NoopCacheService } from '@shared/cache/noop-cache.service';

import type { CacheService } from '@shared/cache/cache.port';

describe('CacheService zadd/ztop', () => {
  describe('NoopCacheService', () => {
    let cache: CacheService;

    beforeEach(() => {
      cache = new NoopCacheService();
    });

    it('zadd resolves without error', async () => {
      await expect(cache.zadd('key', 'member', 1)).resolves.toBeUndefined();
    });

    it('ztop returns empty array', async () => {
      await expect(cache.ztop('key', 10)).resolves.toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd museum-backend && pnpm test -- --testPathPattern=redis-cache-zadd-ztop
```

Expected: FAIL — `zadd` and `ztop` do not exist on `CacheService`.

- [ ] **Step 3: Add `zadd` and `ztop` to `CacheService` port**

In `museum-backend/src/shared/cache/cache.port.ts`, add after the `ping()` method:

```typescript
  /** Increment a member's score in a sorted set (popularity tracking). */
  zadd(key: string, member: string, increment: number): Promise<void>;

  /** Get top N members of a sorted set by score descending. */
  ztop(key: string, n: number): Promise<{ member: string; score: number }[]>;
```

- [ ] **Step 4: Implement in `NoopCacheService`**

In `museum-backend/src/shared/cache/noop-cache.service.ts`, add:

```typescript
  async zadd(): Promise<void> {
    // no-op
  }

  async ztop(): Promise<{ member: string; score: number }[]> {
    return [];
  }
```

- [ ] **Step 5: Implement in `RedisCacheService`**

In `museum-backend/src/shared/cache/redis-cache.service.ts`, add:

```typescript
  async zadd(key: string, member: string, increment: number): Promise<void> {
    try {
      await this.redis.zincrby(key, increment, member);
    } catch {
      // Cache write failure is non-fatal
    }
  }

  async ztop(key: string, n: number): Promise<{ member: string; score: number }[]> {
    try {
      const raw = await this.redis.zrevrange(key, 0, n - 1, 'WITHSCORES');
      const results: { member: string; score: number }[] = [];
      for (let i = 0; i < raw.length; i += 2) {
        results.push({ member: raw[i], score: Number(raw[i + 1]) });
      }
      return results;
    } catch {
      return [];
    }
  }
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd museum-backend && pnpm test -- --testPathPattern=redis-cache-zadd-ztop
```

Expected: PASS (2 tests).

- [ ] **Step 7: Run full cache test suite for non-regression**

```bash
cd museum-backend && pnpm test -- --testPathPattern=cache
```

Expected: All existing cache tests PASS + 2 new tests PASS.

- [ ] **Step 8: Commit**

```bash
git add museum-backend/src/shared/cache/cache.port.ts museum-backend/src/shared/cache/redis-cache.service.ts museum-backend/src/shared/cache/noop-cache.service.ts museum-backend/tests/unit/cache/redis-cache-zadd-ztop.test.ts
git commit -m "feat(cache): add zadd/ztop methods to CacheService port for sorted set operations"
```

---

### Task 2: Create shared cache key utility

**Files:**
- Create: `museum-backend/src/modules/chat/useCase/chat-cache-key.util.ts`
- Create: `museum-backend/tests/fixtures/cache-key-vectors.json`
- Test: `museum-backend/tests/contract/cache-key-parity.test.ts`

**Context:** The cache key builder must produce deterministic hashes from `(text, museumId, locale, guideLevel, audioDescriptionMode)`. The same function is shared between `CachingChatOrchestrator` (cache lookup), `ChatMediaService` (feedback invalidation), and the frontend (local cache key). A shared JSON fixture ensures backend↔frontend parity.

- [ ] **Step 1: Create the cache key test vectors fixture**

Create `museum-backend/tests/fixtures/cache-key-vectors.json`:

```json
[
  {
    "input": { "text": "Qui a peint la Joconde ?", "museumId": "louvre", "locale": "fr", "guideLevel": "beginner", "audioDescriptionMode": false },
    "normalizedText": "qui a peint la joconde ?",
    "components": "qui a peint la joconde ?|fr|beginner|0"
  },
  {
    "input": { "text": "  Who painted  the Mona Lisa?  ", "museumId": "louvre", "locale": "en", "guideLevel": "expert", "audioDescriptionMode": false },
    "normalizedText": "who painted the mona lisa?",
    "components": "who painted the mona lisa?|en|expert|0"
  },
  {
    "input": { "text": "Quand a été créée cette œuvre ?", "museumId": "orsay", "locale": "fr", "guideLevel": "intermediate", "audioDescriptionMode": true },
    "normalizedText": "quand a été créée cette œuvre ?",
    "components": "quand a été créée cette œuvre ?|fr|intermediate|1"
  },
  {
    "input": { "text": "Quelle technique ?", "museumId": "met", "locale": "fr", "guideLevel": "beginner", "audioDescriptionMode": false },
    "normalizedText": "quelle technique ?",
    "components": "quelle technique ?|fr|beginner|0"
  },
  {
    "input": { "text": "Tell me about this painting", "museumId": "british-museum", "locale": "en", "guideLevel": "beginner", "audioDescriptionMode": false },
    "normalizedText": "tell me about this painting",
    "components": "tell me about this painting|en|beginner|0"
  }
]
```

- [ ] **Step 2: Write the contract test**

Create `museum-backend/tests/contract/cache-key-parity.test.ts`:

```typescript
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

import { buildCacheKey, normalizeQuestion } from '@modules/chat/useCase/chat-cache-key.util';

interface TestVector {
  input: {
    text: string;
    museumId: string;
    locale: string;
    guideLevel: string;
    audioDescriptionMode: boolean;
  };
  normalizedText: string;
  components: string;
}

const vectors: TestVector[] = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/cache-key-vectors.json'), 'utf-8'),
) as TestVector[];

describe('cache key parity', () => {
  it.each(vectors)(
    'normalizes "$input.text" correctly',
    ({ input, normalizedText }) => {
      expect(normalizeQuestion(input.text)).toBe(normalizedText);
    },
  );

  it.each(vectors)(
    'produces deterministic key for museumId=$input.museumId locale=$input.locale',
    ({ input, components }) => {
      const key = buildCacheKey({
        text: input.text,
        museumId: input.museumId,
        locale: input.locale,
        guideLevel: input.guideLevel as 'beginner' | 'intermediate' | 'expert',
        audioDescriptionMode: input.audioDescriptionMode,
      });
      const expectedHash = createHash('sha256').update(components).digest('hex').slice(0, 16);
      expect(key).toBe(`chat:llm:${input.museumId}:${expectedHash}`);
    },
  );

  it('produces different keys for different texts', () => {
    const key1 = buildCacheKey({ text: 'question A', museumId: 'm', locale: 'fr', guideLevel: 'beginner', audioDescriptionMode: false });
    const key2 = buildCacheKey({ text: 'question B', museumId: 'm', locale: 'fr', guideLevel: 'beginner', audioDescriptionMode: false });
    expect(key1).not.toBe(key2);
  });

  it('produces different keys for different museums', () => {
    const key1 = buildCacheKey({ text: 'same', museumId: 'louvre', locale: 'fr', guideLevel: 'beginner', audioDescriptionMode: false });
    const key2 = buildCacheKey({ text: 'same', museumId: 'orsay', locale: 'fr', guideLevel: 'beginner', audioDescriptionMode: false });
    expect(key1).not.toBe(key2);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd museum-backend && pnpm test -- --testPathPattern=cache-key-parity
```

Expected: FAIL — `chat-cache-key.util` does not exist.

- [ ] **Step 4: Implement the cache key utility**

Create `museum-backend/src/modules/chat/useCase/chat-cache-key.util.ts`:

```typescript
import { createHash } from 'crypto';

export interface CacheKeyInput {
  text: string;
  museumId: string;
  locale: string;
  guideLevel: string;
  audioDescriptionMode: boolean;
}

/**
 * Normalizes a question for cache key computation.
 * Lowercases, trims, and collapses consecutive whitespace to a single space.
 */
export function normalizeQuestion(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Builds a deterministic Redis cache key for an LLM response.
 * Format: `chat:llm:{museumId}:{sha256(components).slice(0,16)}`
 *
 * IMPORTANT: This function must produce identical output to the frontend
 * `computeLocalCacheKey()`. Any change here requires updating the frontend
 * and re-running the parity tests.
 */
export function buildCacheKey(input: CacheKeyInput): string {
  const normalized = normalizeQuestion(input.text);
  const components = [
    normalized,
    input.locale,
    input.guideLevel,
    input.audioDescriptionMode ? '1' : '0',
  ].join('|');
  const hash = createHash('sha256').update(components).digest('hex').slice(0, 16);
  return `chat:llm:${input.museumId}:${hash}`;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd museum-backend && pnpm test -- --testPathPattern=cache-key-parity
```

Expected: PASS (all vectors + differentiation tests).

- [ ] **Step 6: Commit**

```bash
git add museum-backend/src/modules/chat/useCase/chat-cache-key.util.ts museum-backend/tests/contract/cache-key-parity.test.ts museum-backend/tests/fixtures/cache-key-vectors.json
git commit -m "feat(chat): add shared cache key builder with contract test vectors"
```

---

### Task 3: Create `makeMockCache` test factory

**Files:**
- Create: `museum-backend/tests/helpers/chat/cacheService.fixtures.ts`

**Context:** Multiple test files will need a mock `CacheService`. Create a shared factory per the project's DRY test discipline.

- [ ] **Step 1: Create the factory**

Create `museum-backend/tests/helpers/chat/cacheService.fixtures.ts`:

```typescript
import type { CacheService } from '@shared/cache/cache.port';

/**
 * Creates an in-memory mock CacheService for unit testing.
 * All operations are synchronous Map-based — no Redis needed.
 */
export function makeMockCache(): CacheService & {
  /** Inspect the raw store for assertions. */
  readonly store: Map<string, unknown>;
  /** Inspect the raw sorted sets for assertions. */
  readonly zsets: Map<string, Map<string, number>>;
} {
  const store = new Map<string, unknown>();
  const zsets = new Map<string, Map<string, number>>();

  return {
    store,
    zsets,

    async get<T>(key: string): Promise<T | null> {
      const val = store.get(key);
      return val !== undefined ? (val as T) : null;
    },

    async set<T>(key: string, value: T): Promise<void> {
      store.set(key, value);
    },

    async del(key: string): Promise<void> {
      store.delete(key);
    },

    async delByPrefix(prefix: string): Promise<void> {
      for (const k of store.keys()) {
        if (k.startsWith(prefix)) store.delete(k);
      }
    },

    async setNx<T>(key: string, value: T): Promise<boolean> {
      if (store.has(key)) return false;
      store.set(key, value);
      return true;
    },

    async ping(): Promise<boolean> {
      return true;
    },

    async zadd(key: string, member: string, increment: number): Promise<void> {
      if (!zsets.has(key)) zsets.set(key, new Map());
      const zset = zsets.get(key)!;
      zset.set(member, (zset.get(member) ?? 0) + increment);
    },

    async ztop(key: string, n: number): Promise<{ member: string; score: number }[]> {
      const zset = zsets.get(key);
      if (!zset) return [];
      return [...zset.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([member, score]) => ({ member, score }));
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add museum-backend/tests/helpers/chat/cacheService.fixtures.ts
git commit -m "test(chat): add makeMockCache shared factory for CacheService"
```

---

## Milestone B — CachingChatOrchestrator Core

### Task 4: Add `lowDataMode` to `OrchestratorInput`

**Files:**
- Modify: `museum-backend/src/modules/chat/domain/ports/chat-orchestrator.port.ts`

**Context:** The `OrchestratorInput` interface needs a new optional boolean field so the LangChain orchestrator can shorten prompts in low-data mode.

- [ ] **Step 1: Add the field**

In `museum-backend/src/modules/chat/domain/ports/chat-orchestrator.port.ts`, add after the `audioDescriptionMode` field (line 24):

```typescript
  /** When true, generate a shorter response (low-data mode). */
  lowDataMode?: boolean;
```

- [ ] **Step 2: Verify no tsc regression**

```bash
cd museum-backend && pnpm lint
```

Expected: PASS (optional field = backward compatible).

- [ ] **Step 3: Commit**

```bash
git add museum-backend/src/modules/chat/domain/ports/chat-orchestrator.port.ts
git commit -m "feat(chat): add lowDataMode field to OrchestratorInput"
```

---

### Task 5: Implement `CachingChatOrchestrator` with tests

**Files:**
- Create: `museum-backend/src/modules/chat/adapters/secondary/caching-chat-orchestrator.ts`
- Test: `museum-backend/tests/unit/chat/caching-chat-orchestrator.test.ts`

**Context:** The core decorator. Wraps the real `ChatOrchestrator` with a Redis cache layer. Only caches first-turn, text-only, museum-mode questions without user memory or PII.

- [ ] **Step 1: Write the full test suite**

Create `museum-backend/tests/unit/chat/caching-chat-orchestrator.test.ts`:

```typescript
import { makeMockCache } from '../../helpers/chat/cacheService.fixtures';

import type { CacheService } from '@shared/cache/cache.port';
import type {
  ChatOrchestrator,
  OrchestratorInput,
  OrchestratorOutput,
} from '@modules/chat/domain/ports/chat-orchestrator.port';
import type { PiiSanitizer } from '@modules/chat/domain/ports/pii-sanitizer.port';

// Lazy import — module doesn't exist yet. Will be replaced by real import.
const loadModule = async () =>
  import('@modules/chat/adapters/secondary/caching-chat-orchestrator');

function makeInput(overrides?: Partial<OrchestratorInput>): OrchestratorInput {
  return {
    history: [],
    text: 'Qui a peint la Joconde ?',
    museumMode: true,
    context: { guideLevel: 'beginner' },
    locale: 'fr',
    visitContext: { museumId: 'louvre', museumName: 'Louvre', artworks: [] },
    ...overrides,
  };
}

function makeOutput(overrides?: Partial<OrchestratorOutput>): OrchestratorOutput {
  return {
    text: 'Léonard de Vinci a peint la Joconde.',
    metadata: { followUpQuestions: [] },
    ...overrides,
  };
}

function makeNoPiiSanitizer(): PiiSanitizer {
  return {
    sanitize: (text: string) => text,
    containsPii: () => false,
  };
}

function makePiiDetectingSanitizer(): PiiSanitizer {
  return {
    sanitize: (text: string) => text,
    containsPii: () => true,
  };
}

describe('CachingChatOrchestrator', () => {
  let cache: ReturnType<typeof makeMockCache>;
  let delegate: jest.Mocked<ChatOrchestrator>;
  let piiSanitizer: PiiSanitizer;

  beforeEach(() => {
    cache = makeMockCache();
    delegate = {
      generate: jest.fn<Promise<OrchestratorOutput>, [OrchestratorInput]>(),
      generateStream: jest.fn(),
    };
    piiSanitizer = makeNoPiiSanitizer();
  });

  async function buildOrchestrator(overrides?: { piiSanitizer?: PiiSanitizer }) {
    const { CachingChatOrchestrator } = await loadModule();
    return new CachingChatOrchestrator({
      delegate,
      cache: cache as CacheService,
      ttlSeconds: 604_800,
      popularityZsetTtlSeconds: 2_592_000,
      piiSanitizer: overrides?.piiSanitizer ?? piiSanitizer,
    });
  }

  // ── shouldCache logic ──

  it('skips cache when image is present', async () => {
    const orch = await buildOrchestrator();
    delegate.generate.mockResolvedValue(makeOutput());
    const input = makeInput({ image: { source: 'base64', value: 'abc' } });
    await orch.generate(input);
    expect(delegate.generate).toHaveBeenCalledWith(input);
    expect(cache.store.size).toBe(0);
  });

  it('skips cache when history is non-empty', async () => {
    const orch = await buildOrchestrator();
    delegate.generate.mockResolvedValue(makeOutput());
    await orch.generate(makeInput({ history: [{ role: 'user', text: 'hi' } as never] }));
    expect(delegate.generate).toHaveBeenCalled();
    expect(cache.store.size).toBe(0);
  });

  it('skips cache when museumMode is false', async () => {
    const orch = await buildOrchestrator();
    delegate.generate.mockResolvedValue(makeOutput());
    await orch.generate(makeInput({ museumMode: false }));
    expect(delegate.generate).toHaveBeenCalled();
    expect(cache.store.size).toBe(0);
  });

  it('skips cache when text > 500 chars', async () => {
    const orch = await buildOrchestrator();
    delegate.generate.mockResolvedValue(makeOutput());
    await orch.generate(makeInput({ text: 'a'.repeat(501) }));
    expect(delegate.generate).toHaveBeenCalled();
    expect(cache.store.size).toBe(0);
  });

  it('skips cache when userMemoryBlock is present', async () => {
    const orch = await buildOrchestrator();
    delegate.generate.mockResolvedValue(makeOutput());
    await orch.generate(makeInput({ userMemoryBlock: 'some memory' }));
    expect(delegate.generate).toHaveBeenCalled();
    expect(cache.store.size).toBe(0);
  });

  it('skips cache when PII is detected', async () => {
    const orch = await buildOrchestrator({ piiSanitizer: makePiiDetectingSanitizer() });
    delegate.generate.mockResolvedValue(makeOutput());
    await orch.generate(makeInput());
    expect(delegate.generate).toHaveBeenCalled();
    expect(cache.store.size).toBe(0);
  });

  it('skips cache when no museumId is extractable', async () => {
    const orch = await buildOrchestrator();
    delegate.generate.mockResolvedValue(makeOutput());
    await orch.generate(makeInput({ visitContext: undefined, context: undefined }));
    expect(delegate.generate).toHaveBeenCalled();
    expect(cache.store.size).toBe(0);
  });

  // ── generate() cache hit/miss ──

  it('on cache miss, delegates and stores the result', async () => {
    const orch = await buildOrchestrator();
    const output = makeOutput();
    delegate.generate.mockResolvedValue(output);

    const result = await orch.generate(makeInput());

    expect(result).toEqual(output);
    expect(delegate.generate).toHaveBeenCalledTimes(1);
    expect(cache.store.size).toBe(1);
  });

  it('on cache hit, returns cached and does not call delegate', async () => {
    const orch = await buildOrchestrator();
    const output = makeOutput();
    delegate.generate.mockResolvedValue(output);

    // First call → miss → store
    await orch.generate(makeInput());
    expect(delegate.generate).toHaveBeenCalledTimes(1);

    // Second call → hit → no delegate
    delegate.generate.mockClear();
    const result = await orch.generate(makeInput());
    expect(result.text).toBe(output.text);
    expect(delegate.generate).not.toHaveBeenCalled();
  });

  it('verifies originalText on cache hit (collision protection)', async () => {
    const orch = await buildOrchestrator();
    const output = makeOutput();
    delegate.generate.mockResolvedValue(output);

    // Manually insert a cached entry with a DIFFERENT originalText
    const input = makeInput();
    await orch.generate(input); // stores with correct originalText
    expect(delegate.generate).toHaveBeenCalledTimes(1);

    // Tamper the cached value
    for (const [key, val] of cache.store.entries()) {
      if (typeof val === 'object' && val !== null) {
        (val as Record<string, unknown>).originalText = 'different question';
        cache.store.set(key, val);
      }
    }

    // Next call should treat as miss (originalText mismatch)
    delegate.generate.mockClear();
    delegate.generate.mockResolvedValue(makeOutput({ text: 'fresh' }));
    const result = await orch.generate(input);
    expect(delegate.generate).toHaveBeenCalledTimes(1);
    expect(result.text).toBe('fresh');
  });

  // ── bumpPopularity ──

  it('increments popularity ZSET on cache hit and miss', async () => {
    const orch = await buildOrchestrator();
    delegate.generate.mockResolvedValue(makeOutput());

    await orch.generate(makeInput());
    await orch.generate(makeInput()); // hit

    const popular = cache.zsets.get('chat:llm:popular:louvre');
    expect(popular).toBeDefined();
    const entries = [...popular!.values()];
    expect(entries[0]).toBe(2); // bumped twice
  });

  // ── fail-open ──

  it('returns delegate result when cache.get throws', async () => {
    const orch = await buildOrchestrator();
    const output = makeOutput();
    delegate.generate.mockResolvedValue(output);

    const origGet = cache.get.bind(cache);
    cache.get = jest.fn().mockRejectedValue(new Error('Redis down'));

    const result = await orch.generate(makeInput());
    expect(result).toEqual(output);
    expect(delegate.generate).toHaveBeenCalled();
    cache.get = origGet;
  });

  it('returns delegate result when cache.set throws', async () => {
    const orch = await buildOrchestrator();
    const output = makeOutput();
    delegate.generate.mockResolvedValue(output);

    cache.set = jest.fn().mockRejectedValue(new Error('Redis down'));

    const result = await orch.generate(makeInput());
    expect(result).toEqual(output);
  });

  // ── generateStream ──

  it('generateStream replays cached chunks on hit', async () => {
    const orch = await buildOrchestrator();
    const output = makeOutput({ text: 'Short cached answer.' });
    delegate.generate.mockResolvedValue(output);

    // First: generate (non-stream) to populate cache
    await orch.generate(makeInput());

    // Then: generateStream should replay from cache
    const chunks: string[] = [];
    delegate.generateStream.mockClear();
    const result = await orch.generateStream(makeInput(), (c) => chunks.push(c));

    expect(delegate.generateStream).not.toHaveBeenCalled();
    expect(chunks.join('')).toBe('Short cached answer.');
    expect(result.text).toBe('Short cached answer.');
  });

  it('generateStream delegates and caches on miss', async () => {
    const orch = await buildOrchestrator();
    const output = makeOutput({ text: 'Streamed answer.' });
    delegate.generateStream.mockImplementation(async (input, onChunk) => {
      onChunk('Streamed ');
      onChunk('answer.');
      return output;
    });

    const chunks: string[] = [];
    const result = await orch.generateStream(makeInput(), (c) => chunks.push(c));

    expect(chunks).toEqual(['Streamed ', 'answer.']);
    expect(result).toEqual(output);
    expect(cache.store.size).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd museum-backend && pnpm test -- --testPathPattern=caching-chat-orchestrator
```

Expected: FAIL — module `caching-chat-orchestrator` does not exist.

- [ ] **Step 3: Implement `CachingChatOrchestrator`**

Create `museum-backend/src/modules/chat/adapters/secondary/caching-chat-orchestrator.ts`:

```typescript
import { logger } from '@shared/logger/logger';

import { buildCacheKey, normalizeQuestion } from '../../useCase/chat-cache-key.util';

import type { CacheService } from '@shared/cache/cache.port';
import type {
  ChatOrchestrator,
  OrchestratorInput,
  OrchestratorOutput,
} from '../../domain/ports/chat-orchestrator.port';
import type { ChatAssistantMetadata, VisitContext } from '../../domain/chat.types';
import type { PiiSanitizer } from '../../domain/ports/pii-sanitizer.port';

/** Cached value stored in Redis alongside the original text (for collision protection). */
interface CachedOrchestratorOutput {
  originalText: string;
  locale: string;
  text: string;
  metadata: ChatAssistantMetadata;
}

export interface CachingChatOrchestratorDeps {
  delegate: ChatOrchestrator;
  cache: CacheService;
  ttlSeconds: number;
  popularityZsetTtlSeconds: number;
  piiSanitizer: PiiSanitizer;
}

/**
 * Decorator that wraps a {@link ChatOrchestrator} with a Redis cache layer.
 *
 * Only caches first-turn, text-only, museum-mode questions without user memory or PII.
 * Implements the same {@link ChatOrchestrator} port so it's transparent to callers.
 */
export class CachingChatOrchestrator implements ChatOrchestrator {
  private readonly delegate: ChatOrchestrator;
  private readonly cache: CacheService;
  private readonly ttlSeconds: number;
  private readonly piiSanitizer: PiiSanitizer;

  constructor(deps: CachingChatOrchestratorDeps) {
    this.delegate = deps.delegate;
    this.cache = deps.cache;
    this.ttlSeconds = deps.ttlSeconds;
    this.piiSanitizer = deps.piiSanitizer;
  }

  async generate(input: OrchestratorInput): Promise<OrchestratorOutput> {
    if (!this.shouldCache(input)) {
      return this.delegate.generate(input);
    }

    const key = this.computeKey(input);
    try {
      const cached = await this.cache.get<CachedOrchestratorOutput>(key);
      if (cached && cached.originalText === normalizeQuestion(input.text!)) {
        logger.info('llm_cache_hit', { museumId: this.extractMuseumId(input), key });
        await this.bumpPopularity(input, key);
        return { text: cached.text, metadata: cached.metadata };
      }
    } catch {
      // fail-open: cache read error → proceed to delegate
    }

    const output = await this.delegate.generate(input);
    await this.storeAndBump(input, key, output);
    return output;
  }

  async generateStream(
    input: OrchestratorInput,
    onChunk: (text: string) => void,
  ): Promise<OrchestratorOutput> {
    if (this.shouldCache(input)) {
      const key = this.computeKey(input);
      try {
        const cached = await this.cache.get<CachedOrchestratorOutput>(key);
        if (cached && cached.originalText === normalizeQuestion(input.text!)) {
          logger.info('llm_cache_hit', { museumId: this.extractMuseumId(input), key });
          await this.replayCachedAsStream(cached.text, onChunk);
          await this.bumpPopularity(input, key);
          return { text: cached.text, metadata: cached.metadata };
        }
      } catch {
        // fail-open
      }
    }

    const output = await this.delegate.generateStream(input, onChunk);

    if (this.shouldCache(input)) {
      const key = this.computeKey(input);
      await this.storeAndBump(input, key, output);
    }

    return output;
  }

  private shouldCache(input: OrchestratorInput): boolean {
    return (
      input.museumMode === true &&
      !input.image &&
      input.history.length === 0 &&
      !!input.text &&
      input.text.length < 500 &&
      !input.userMemoryBlock &&
      !this.piiSanitizer.containsPii(input.text) &&
      this.extractMuseumId(input) !== null
    );
  }

  private computeKey(input: OrchestratorInput): string {
    return buildCacheKey({
      text: input.text!,
      museumId: this.extractMuseumId(input)!,
      locale: input.locale ?? 'fr',
      guideLevel: input.context?.guideLevel ?? 'beginner',
      audioDescriptionMode: input.audioDescriptionMode ?? false,
    });
  }

  private extractMuseumId(input: OrchestratorInput): string | null {
    return (input.visitContext as VisitContext | null | undefined)?.museumId ?? null;
  }

  private async storeAndBump(
    input: OrchestratorInput,
    key: string,
    output: OrchestratorOutput,
  ): Promise<void> {
    const toCache: CachedOrchestratorOutput = {
      originalText: normalizeQuestion(input.text!),
      locale: input.locale ?? 'fr',
      text: output.text,
      metadata: output.metadata,
    };
    try {
      await this.cache.set(key, toCache, this.ttlSeconds);
    } catch {
      // fail-open
    }
    await this.bumpPopularity(input, key);
  }

  private async bumpPopularity(input: OrchestratorInput, key: string): Promise<void> {
    const museumId = this.extractMuseumId(input);
    if (!museumId) return;
    try {
      await this.cache.zadd(`chat:llm:popular:${museumId}`, key, 1);
    } catch {
      // fail-open
    }
  }

  private async replayCachedAsStream(
    text: string,
    onChunk: (chunk: string) => void,
  ): Promise<void> {
    const CHUNK_SIZE = 8;
    const CHUNK_DELAY_MS = 25;
    for (let i = 0; i < text.length; i += CHUNK_SIZE) {
      onChunk(text.slice(i, i + CHUNK_SIZE));
      if (i + CHUNK_SIZE < text.length) {
        await new Promise<void>((r) => setTimeout(r, CHUNK_DELAY_MS));
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd museum-backend && pnpm test -- --testPathPattern=caching-chat-orchestrator
```

Expected: PASS (all ~20 tests).

- [ ] **Step 5: Typecheck**

```bash
cd museum-backend && pnpm lint
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add museum-backend/src/modules/chat/adapters/secondary/caching-chat-orchestrator.ts museum-backend/tests/unit/chat/caching-chat-orchestrator.test.ts
git commit -m "feat(chat): CachingChatOrchestrator decorator with Redis cache, privacy gates, streaming replay"
```

---

## Milestone C — Backend Wiring & Routes

### Task 6: Env config for LLM cache TTL

**Files:**
- Modify: `museum-backend/src/config/env.ts`

- [ ] **Step 1: Add cache LLM config fields**

In `museum-backend/src/config/env.ts`, locate the `cache` section and add:

```typescript
    /** TTL for LLM response cache entries (seconds). Default 7 days. */
    llmTtlSeconds: z.coerce.number().int().min(60).max(31_536_000).default(604_800),
    /** TTL for popularity ZSET entries (seconds). Default 30 days. */
    llmPopularityTtlSeconds: z.coerce.number().int().min(3600).max(31_536_000).default(2_592_000),
    /** Maximum entries per museum in low-data pack. Default 30. */
    lowDataPackMaxEntries: z.coerce.number().int().min(5).max(100).default(30),
```

- [ ] **Step 2: Typecheck**

```bash
cd museum-backend && pnpm lint
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add museum-backend/src/config/env.ts
git commit -m "feat(config): add LLM cache TTL and low-data pack config"
```

---

### Task 7: Wire `CachingChatOrchestrator` in `ChatModule`

**Files:**
- Modify: `museum-backend/src/modules/chat/index.ts`

**Context:** The `ChatModule.build()` method currently creates a `LangChainChatOrchestrator` directly. We wrap it with `CachingChatOrchestrator` when cache is enabled. Note: `FallbackChatOrchestrator` is not used in the current code — the `LangChainChatOrchestrator` is used directly. We wrap it as-is.

- [ ] **Step 1: Add import and wrapping logic**

In `museum-backend/src/modules/chat/index.ts`, add the import:

```typescript
import { CachingChatOrchestrator } from './adapters/secondary/caching-chat-orchestrator';
```

Then in the `build()` method, after `const orchestrator = new LangChainChatOrchestrator();` (line 211), replace the section that builds `ChatService` to wrap the orchestrator:

```typescript
    const orchestrator = new LangChainChatOrchestrator();
    this._orchestrator = orchestrator;

    // Wrap with caching decorator if Redis is available
    const effectiveOrchestrator =
      cache != null
        ? new CachingChatOrchestrator({
            delegate: orchestrator,
            cache,
            ttlSeconds: env.cache?.llmTtlSeconds ?? 604_800,
            popularityZsetTtlSeconds: env.cache?.llmPopularityTtlSeconds ?? 2_592_000,
            piiSanitizer: new RegexPiiSanitizer(),
          })
        : orchestrator;

    const artTopicClassifier = new ArtTopicClassifier();

    const chatService = new ChatService({
      repository,
      orchestrator: effectiveOrchestrator,
      imageStorage,
```

Update the `ChatService` constructor call to use `effectiveOrchestrator` instead of `orchestrator` for the `orchestrator` field.

- [ ] **Step 2: Add `RegexPiiSanitizer` import if not already present**

Verify import exists: `import { RegexPiiSanitizer } from './adapters/secondary/pii-sanitizer.regex';` — it's already imported at line 13.

- [ ] **Step 3: Typecheck**

```bash
cd museum-backend && pnpm lint
```

Expected: PASS.

- [ ] **Step 4: Run full backend tests for non-regression**

```bash
cd museum-backend && pnpm test 2>&1 | tail -5
```

Expected: All 2331+ tests PASS.

- [ ] **Step 5: Commit**

```bash
git add museum-backend/src/modules/chat/index.ts
git commit -m "feat(chat): wire CachingChatOrchestrator decorator when cache is enabled"
```

---

### Task 8: Parse `X-Data-Mode` header + propagate to orchestrator

**Files:**
- Modify: `museum-backend/src/modules/chat/adapters/primary/http/chat.contracts.ts`
- Modify: `museum-backend/src/modules/chat/useCase/chat-message.service.ts`
- Modify: `museum-backend/src/modules/chat/adapters/secondary/langchain.orchestrator.ts`

**Context:** The frontend sends `X-Data-Mode: low | normal`. We parse it in `chat.contracts.ts`, pass it through to the orchestrator input, and adjust the system prompt in `LangChainChatOrchestrator` when `lowDataMode=true`.

- [ ] **Step 1: Parse the header in `chat.contracts.ts`**

In the `parsePostMessageBody` or equivalent function, extract the header:

```typescript
const dataMode = req.headers['x-data-mode'];
const lowDataMode = dataMode === 'low';
```

Propagate this value to the service layer (add to the parsed context or request body result).

- [ ] **Step 2: Pass `lowDataMode` through `ChatMessageService` to the orchestrator input**

In `chat-message.service.ts`, in the `postMessage` and `postMessageStream` methods, when building the `OrchestratorInput`, add:

```typescript
lowDataMode: input.lowDataMode ?? false,
```

- [ ] **Step 3: Handle `lowDataMode` in `LangChainChatOrchestrator`**

In `langchain.orchestrator.ts`, when `input.lowDataMode === true`:
- Add to the system prompt: `"\n\nIMPORTANT: The user is on a low-bandwidth connection. Provide a concise factual answer in 100-150 words maximum. Skip elaborate descriptions."`
- Set `max_tokens: 200` (or reduce it from the default)

- [ ] **Step 4: Typecheck**

```bash
cd museum-backend && pnpm lint
```

- [ ] **Step 5: Run tests**

```bash
cd museum-backend && pnpm test 2>&1 | tail -5
```

Expected: All existing tests PASS (lowDataMode defaults to false = no behavioral change).

- [ ] **Step 6: Commit**

```bash
git add museum-backend/src/modules/chat/adapters/primary/http/chat.contracts.ts museum-backend/src/modules/chat/useCase/chat-message.service.ts museum-backend/src/modules/chat/adapters/secondary/langchain.orchestrator.ts
git commit -m "feat(chat): parse X-Data-Mode header and adapt prompt for low-data mode"
```

---

### Task 9: `MuseumQaSeed` entity + migration

**Files:**
- Create: `museum-backend/src/modules/museum/domain/museumQaSeed.entity.ts`
- Create: `museum-backend/src/data/db/migrations/<timestamp>-AddMuseumQaSeed.ts`

- [ ] **Step 1: Create entity**

Create `museum-backend/src/modules/museum/domain/museumQaSeed.entity.ts`:

```typescript
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Seeded Q&A entries for museum low-data packs. Mapped to `museum_qa_seed`. */
@Entity({ name: 'museum_qa_seed' })
@Index(['museumId', 'locale'])
export class MuseumQaSeed {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  museumId!: string;

  @Column({ type: 'varchar', length: 8 })
  locale!: string;

  @Column({ type: 'text' })
  question!: string;

  @Column({ type: 'text' })
  answer!: string;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
```

- [ ] **Step 2: Register entity in data source**

Add `MuseumQaSeed` to the entity array in `museum-backend/src/data/db/data-source.ts`.

- [ ] **Step 3: Generate migration**

```bash
cd museum-backend && node scripts/migration-cli.cjs generate --name=AddMuseumQaSeed
```

- [ ] **Step 4: Verify migration content**

Read the generated file and confirm it creates the `museum_qa_seed` table with the correct columns and index. Verify the `down()` drops the table.

- [ ] **Step 5: Typecheck**

```bash
cd museum-backend && pnpm lint
```

- [ ] **Step 6: Commit**

```bash
git add museum-backend/src/modules/museum/domain/museumQaSeed.entity.ts museum-backend/src/data/db/ museum-backend/src/data/db/migrations/
git commit -m "feat(museum): add MuseumQaSeed entity with migration"
```

---

### Task 10: `LowDataPackService` + route + tests

**Files:**
- Create: `museum-backend/src/modules/museum/domain/museumQaSeed.repository.interface.ts`
- Create: `museum-backend/src/modules/museum/adapters/secondary/museum-qa-seed.repository.typeorm.ts`
- Create: `museum-backend/src/modules/museum/useCase/low-data-pack.service.ts`
- Create: `museum-backend/src/modules/museum/adapters/primary/http/low-data-pack.route.ts`
- Test: `museum-backend/tests/unit/museum/low-data-pack-service.test.ts`
- Test: `museum-backend/tests/integration/museum/low-data-pack.route.test.ts`

**Context:** This task combines the service + repo + route since they're tightly coupled and not independently useful. Wire into the museum module at the end.

- [ ] **Step 1: Create repository interface**

Create `museum-backend/src/modules/museum/domain/museumQaSeed.repository.interface.ts`:

```typescript
import type { MuseumQaSeed } from './museumQaSeed.entity';

export interface MuseumQaSeedRepository {
  findByMuseumAndLocale(museumId: string, locale: string): Promise<MuseumQaSeed[]>;
}
```

- [ ] **Step 2: Create TypeORM repository**

Create `museum-backend/src/modules/museum/adapters/secondary/museum-qa-seed.repository.typeorm.ts`:

```typescript
import { MuseumQaSeed } from '../../domain/museumQaSeed.entity';

import type { MuseumQaSeedRepository } from '../../domain/museumQaSeed.repository.interface';
import type { DataSource, Repository } from 'typeorm';

export class TypeOrmMuseumQaSeedRepository implements MuseumQaSeedRepository {
  private readonly repo: Repository<MuseumQaSeed>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(MuseumQaSeed);
  }

  async findByMuseumAndLocale(museumId: string, locale: string): Promise<MuseumQaSeed[]> {
    return this.repo.find({
      where: { museumId, locale },
      order: { createdAt: 'ASC' },
    });
  }
}
```

- [ ] **Step 3: Write `LowDataPackService` unit tests**

Create `museum-backend/tests/unit/museum/low-data-pack-service.test.ts`:

```typescript
import { makeMockCache } from '../../helpers/chat/cacheService.fixtures';

import type { MuseumQaSeedRepository } from '@modules/museum/domain/museumQaSeed.repository.interface';

const loadModule = async () =>
  import('@modules/museum/useCase/low-data-pack.service');

function makeSeedRepo(seeds: Array<{ question: string; answer: string; metadata: Record<string, unknown> }> = []): MuseumQaSeedRepository {
  return {
    findByMuseumAndLocale: jest.fn().mockResolvedValue(
      seeds.map((s, i) => ({ id: `seed-${i}`, museumId: 'louvre', locale: 'fr', ...s, createdAt: new Date() })),
    ),
  };
}

describe('LowDataPackService', () => {
  it('returns popular cached answers + seeded entries merged', async () => {
    const cache = makeMockCache();
    // Populate cache with a cached LLM response
    const key = 'chat:llm:louvre:abc123';
    await cache.set(key, { originalText: 'who painted this?', locale: 'fr', text: 'Leonardo.', metadata: {} });
    await cache.zadd('chat:llm:popular:louvre', key, 5);

    const seedRepo = makeSeedRepo([{ question: 'Quand ?', answer: '1503.', metadata: {} }]);
    const { LowDataPackService } = await loadModule();
    const service = new LowDataPackService(cache, seedRepo, 30);

    const pack = await service.getLowDataPack('louvre', 'fr');

    expect(pack.museumId).toBe('louvre');
    expect(pack.entries).toHaveLength(2);
    expect(pack.entries[0].source).toBe('cache');
    expect(pack.entries[0].question).toBe('who painted this?');
    expect(pack.entries[1].source).toBe('seeded');
    expect(pack.entries[1].question).toBe('Quand ?');
  });

  it('returns only seeded if cache is empty', async () => {
    const cache = makeMockCache();
    const seedRepo = makeSeedRepo([{ question: 'Q?', answer: 'A.', metadata: {} }]);
    const { LowDataPackService } = await loadModule();
    const service = new LowDataPackService(cache, seedRepo, 30);

    const pack = await service.getLowDataPack('louvre', 'fr');
    expect(pack.entries).toHaveLength(1);
    expect(pack.entries[0].source).toBe('seeded');
  });

  it('returns empty entries when both empty', async () => {
    const cache = makeMockCache();
    const seedRepo = makeSeedRepo();
    const { LowDataPackService } = await loadModule();
    const service = new LowDataPackService(cache, seedRepo, 30);

    const pack = await service.getLowDataPack('orsay', 'en');
    expect(pack.entries).toHaveLength(0);
  });

  it('is fail-open when cache.ztop throws', async () => {
    const cache = makeMockCache();
    cache.ztop = jest.fn().mockRejectedValue(new Error('Redis down'));
    const seedRepo = makeSeedRepo([{ question: 'Q?', answer: 'A.', metadata: {} }]);
    const { LowDataPackService } = await loadModule();
    const service = new LowDataPackService(cache, seedRepo, 30);

    const pack = await service.getLowDataPack('louvre', 'fr');
    expect(pack.entries).toHaveLength(1); // only seeded
  });

  it('filters by locale', async () => {
    const cache = makeMockCache();
    const key = 'chat:llm:louvre:xyz';
    await cache.set(key, { originalText: 'test', locale: 'en', text: 'Answer.', metadata: {} });
    await cache.zadd('chat:llm:popular:louvre', key, 3);

    const seedRepo = makeSeedRepo();
    const { LowDataPackService } = await loadModule();
    const service = new LowDataPackService(cache, seedRepo, 30);

    const pack = await service.getLowDataPack('louvre', 'fr'); // Requesting FR
    // The cached entry is locale=en, so it should be filtered out
    expect(pack.entries).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Implement `LowDataPackService`**

Create `museum-backend/src/modules/museum/useCase/low-data-pack.service.ts`:

```typescript
import { logger } from '@shared/logger/logger';

import type { MuseumQaSeedRepository } from '../domain/museumQaSeed.repository.interface';
import type { CacheService } from '@shared/cache/cache.port';

interface CachedEntry {
  originalText: string;
  locale: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface LowDataPackEntry {
  question: string;
  answer: string;
  metadata?: Record<string, unknown>;
  hits?: number;
  source: 'cache' | 'seeded';
}

export interface LowDataPack {
  museumId: string;
  locale: string;
  generatedAt: string;
  entries: LowDataPackEntry[];
}

export class LowDataPackService {
  constructor(
    private readonly cache: CacheService,
    private readonly seedRepo: MuseumQaSeedRepository,
    private readonly maxEntries: number,
  ) {}

  async getLowDataPack(museumId: string, locale: string): Promise<LowDataPack> {
    let cachedAnswers: LowDataPackEntry[] = [];

    try {
      const popular = await this.cache.ztop(`chat:llm:popular:${museumId}`, this.maxEntries);

      const resolved = await Promise.all(
        popular.map(async ({ member, score }) => {
          const value = await this.cache.get<CachedEntry>(member);
          if (value && value.locale === locale) {
            return {
              question: value.originalText,
              answer: value.text,
              metadata: value.metadata,
              hits: score,
              source: 'cache' as const,
            };
          }
          return null;
        }),
      );
      cachedAnswers = resolved.filter((e): e is LowDataPackEntry => e !== null);
    } catch (error) {
      logger.warn('low_data_pack_cache_error', {
        museumId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const seeded = await this.seedRepo.findByMuseumAndLocale(museumId, locale);
    const seededEntries: LowDataPackEntry[] = seeded.map((s) => ({
      question: s.question,
      answer: s.answer,
      metadata: s.metadata,
      source: 'seeded' as const,
    }));

    return {
      museumId,
      locale,
      generatedAt: new Date().toISOString(),
      entries: [...cachedAnswers, ...seededEntries],
    };
  }
}
```

- [ ] **Step 5: Create the route**

Create `museum-backend/src/modules/museum/adapters/primary/http/low-data-pack.route.ts`:

```typescript
import { Router } from 'express';

import type { LowDataPackService } from '../../../useCase/low-data-pack.service';

export function createLowDataPackRouter(service: LowDataPackService): Router {
  const router = Router();

  router.get('/museums/:id/low-data-pack', async (req, res, next) => {
    try {
      const museumId = req.params.id;
      const locale = typeof req.query.locale === 'string' ? req.query.locale : 'fr';

      const pack = await service.getLowDataPack(museumId, locale);

      res.set('Cache-Control', 'public, max-age=3600');
      res.json(pack);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
```

- [ ] **Step 6: Wire into museum module and app**

Add the `LowDataPackService` construction and route mounting in the museum module's barrel or directly in `app.ts`.

- [ ] **Step 7: Run tests**

```bash
cd museum-backend && pnpm test -- --testPathPattern=low-data-pack
```

Expected: PASS.

- [ ] **Step 8: Typecheck**

```bash
cd museum-backend && pnpm lint
```

- [ ] **Step 9: Commit**

```bash
git add museum-backend/src/modules/museum/ museum-backend/tests/unit/museum/low-data-pack-service.test.ts
git commit -m "feat(museum): LowDataPackService + GET /museums/:id/low-data-pack endpoint"
```

---

### Task 11: Admin cache purge route

**Files:**
- Create: `museum-backend/src/modules/admin/adapters/primary/http/cache-purge.route.ts`
- Test: `museum-backend/tests/integration/admin/cache-purge.route.test.ts`

- [ ] **Step 1: Create the route**

Create `museum-backend/src/modules/admin/adapters/primary/http/cache-purge.route.ts`:

```typescript
import { Router } from 'express';

import { logger } from '@shared/logger/logger';

import type { CacheService } from '@shared/cache/cache.port';
import type { AuditService } from '@shared/audit/audit.service';

export function createCachePurgeRouter(cache: CacheService, audit?: AuditService): Router {
  const router = Router();

  router.post('/admin/museums/:id/cache/purge', async (req, res, next) => {
    try {
      const museumId = req.params.id;
      const adminId = (req as Record<string, unknown>).userId as number | undefined;
      const start = Date.now();

      await cache.delByPrefix(`chat:llm:${museumId}:`);

      const durationMs = Date.now() - start;
      logger.warn('llm_cache_admin_purged', { museumId, adminId, durationMs });

      if (audit && adminId) {
        await audit.log({
          action: 'cache_purge',
          userId: adminId,
          targetType: 'museum',
          targetId: museumId,
          details: { durationMs },
        });
      }

      res.json({ museumId, durationMs });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
```

- [ ] **Step 2: Wire with admin role guard**

Mount the router in the admin routes with `requireRole('admin')` middleware.

- [ ] **Step 3: Write integration test**

Test that non-admin gets 403, admin gets 200, audit log is created.

- [ ] **Step 4: Run tests, typecheck, commit**

```bash
git add museum-backend/src/modules/admin/ museum-backend/tests/integration/admin/
git commit -m "feat(admin): POST /admin/museums/:id/cache/purge with audit logging"
```

---

### Task 12: Feedback cache invalidation hook

**Files:**
- Modify: `museum-backend/src/modules/chat/useCase/chat-media.service.ts`
- Test: `museum-backend/tests/integration/chat/feedback-cache-invalidation.test.ts`

**Context:** When a user sends negative feedback on a cached message, we invalidate the corresponding cache key. The `setMessageFeedback` method already exists — we add cache invalidation logic after the existing DB write.

- [ ] **Step 1: Write the integration test**

Create `museum-backend/tests/integration/chat/feedback-cache-invalidation.test.ts`:

```typescript
import { makeMockCache } from '../../helpers/chat/cacheService.fixtures';
import { makeMessage } from '../../helpers/chat/message.fixtures';
import { makeSession } from '../../helpers/chat/message.fixtures';

describe('feedback cache invalidation', () => {
  it('negative feedback deletes the cache key for the question', async () => {
    const cache = makeMockCache();
    const cacheKey = 'chat:llm:louvre:abc123';
    await cache.set(cacheKey, { originalText: 'test question', text: 'answer', metadata: {} });

    // ... setup: create session with user message + assistant message
    // ... call setMessageFeedback with value: 'negative'
    // ... verify cache.get(cacheKey) returns null

    expect(cache.store.has(cacheKey)).toBe(false);
  });

  it('positive feedback does NOT invalidate cache', async () => {
    const cache = makeMockCache();
    const cacheKey = 'chat:llm:louvre:abc123';
    await cache.set(cacheKey, { originalText: 'test question', text: 'answer', metadata: {} });

    // ... call setMessageFeedback with value: 'positive'

    expect(cache.store.has(cacheKey)).toBe(true);
  });
});
```

- [ ] **Step 2: Implement the hook in `ChatMediaService.setMessageFeedback`**

In `chat-media.service.ts`, after the existing feedback DB write, add:

```typescript
// Cache invalidation on negative feedback
if (value === 'negative' && this.cache) {
  try {
    // Find the preceding user message in the session to get the original question
    const messages = await this.repository.listSessionHistory(row.message.sessionId, 2);
    const userMsg = messages.find((m) => m.role === 'user');
    if (userMsg?.text && row.session?.museumId) {
      const key = buildCacheKey({
        text: userMsg.text,
        museumId: row.session.museumId,
        locale: row.session.locale ?? 'fr',
        guideLevel: row.session.guideLevel ?? 'beginner',
        audioDescriptionMode: false,
      });
      await this.cache.del(key);
      logger.info('llm_cache_invalidated_by_feedback', {
        museumId: row.session.museumId,
        key,
      });
    }
  } catch {
    // fail-open: cache invalidation failure doesn't affect feedback
  }
}
```

- [ ] **Step 3: Run tests, typecheck, commit**

```bash
git add museum-backend/src/modules/chat/useCase/chat-media.service.ts museum-backend/tests/integration/chat/feedback-cache-invalidation.test.ts
git commit -m "feat(chat): invalidate LLM cache on negative feedback"
```

---

### Task 13: KnowledgeBase Redis upgrade

**Files:**
- Modify: `museum-backend/src/modules/chat/useCase/knowledge-base.service.ts`
- Modify: `museum-backend/tests/unit/chat/knowledge-base-service.test.ts`

**Context:** Replace the `Map<string, CacheEntry>` in-memory cache with `CacheService` calls (prefix `kb:wikidata:`). The constructor now requires an optional `CacheService`.

- [ ] **Step 1: Update the service**

In `knowledge-base.service.ts`:
- Add `cache?: CacheService` to the constructor
- Replace `this.cache.get(key)` / `this.cache.set(key, ...)` with `this.cacheService.get(...)` / `this.cacheService.set(...)`
- Remove the `Map` and `evictIfNeeded` (Redis handles TTL)
- Keep fail-open: if no `cacheService`, skip cache

- [ ] **Step 2: Update tests to use `makeMockCache`**

Adapt existing tests in `knowledge-base-service.test.ts` to inject `makeMockCache()` and verify Redis-based caching behavior.

- [ ] **Step 3: Update `ChatModule.buildKnowledgeBase()` to pass cache**

In `chat/index.ts`, pass `cache` to `KnowledgeBaseService` constructor.

- [ ] **Step 4: Run tests, typecheck, commit**

```bash
git add museum-backend/src/modules/chat/useCase/knowledge-base.service.ts museum-backend/tests/unit/chat/knowledge-base-service.test.ts museum-backend/src/modules/chat/index.ts
git commit -m "refactor(chat): migrate KnowledgeBaseService cache from in-memory Map to Redis"
```

---

### Task 14: Backend quality gate

- [ ] **Step 1: Full typecheck**

```bash
cd museum-backend && pnpm lint
```

Expected: 0 errors.

- [ ] **Step 2: Full test suite**

```bash
cd museum-backend && pnpm test
```

Expected: All tests PASS (2331 existing + ~85 new = 2416 target).

- [ ] **Step 3: OpenAPI validate**

```bash
cd museum-backend && pnpm openapi:validate
```

Add the new routes (`GET /museums/:id/low-data-pack`, `POST /admin/museums/:id/cache/purge`) to the OpenAPI spec if not yet done.

- [ ] **Step 4: Commit any final fixes**

---

## Milestone D — Frontend Foundation

### Task 15: `computeLocalCacheKey` + parity test

**Files:**
- Create: `museum-frontend/features/chat/application/computeLocalCacheKey.ts`
- Create: `museum-frontend/__tests__/chat/cacheKeyParity.test.ts`
- Copy: `museum-backend/tests/fixtures/cache-key-vectors.json` → `museum-frontend/__tests__/fixtures/cache-key-vectors.json`

- [ ] **Step 1: Copy the shared fixture**

```bash
mkdir -p museum-frontend/__tests__/fixtures
cp museum-backend/tests/fixtures/cache-key-vectors.json museum-frontend/__tests__/fixtures/cache-key-vectors.json
```

- [ ] **Step 2: Write the parity test**

Create `museum-frontend/__tests__/chat/cacheKeyParity.test.ts`:

```typescript
import { createHash } from 'crypto';
import vectors from '../fixtures/cache-key-vectors.json';

import { computeLocalCacheKey, normalizeQuestion } from '@/features/chat/application/computeLocalCacheKey';

describe('cache key parity with backend', () => {
  it.each(vectors)('normalizes "$input.text" correctly', ({ input, normalizedText }) => {
    expect(normalizeQuestion(input.text)).toBe(normalizedText);
  });

  it.each(vectors)(
    'produces same key as backend for museumId=$input.museumId',
    ({ input, components }) => {
      const key = computeLocalCacheKey({
        text: input.text,
        museumId: input.museumId,
        locale: input.locale,
        guideLevel: input.guideLevel,
        audioDescriptionMode: input.audioDescriptionMode,
      });
      const expectedHash = createHash('sha256').update(components).digest('hex').slice(0, 16);
      expect(key).toBe(`chat:llm:${input.museumId}:${expectedHash}`);
    },
  );
});
```

- [ ] **Step 3: Implement**

Create `museum-frontend/features/chat/application/computeLocalCacheKey.ts`:

```typescript
import * as Crypto from 'expo-crypto';

export interface LocalCacheKeyInput {
  text: string;
  museumId: string;
  locale: string;
  guideLevel?: string;
  audioDescriptionMode?: boolean;
}

export function normalizeQuestion(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function computeLocalCacheKey(input: LocalCacheKeyInput): string {
  const normalized = normalizeQuestion(input.text);
  const components = [
    normalized,
    input.locale,
    input.guideLevel ?? 'beginner',
    input.audioDescriptionMode ? '1' : '0',
  ].join('|');
  const hash = Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    components,
  );
  // Note: expo-crypto is async. For sync usage in tests and store,
  // we use a sync fallback via crypto module (Node.js test environment).
  // In production, use the async version and cache the hash.
  return `chat:llm:${input.museumId}:${hashSync(components)}`;
}

/** Sync SHA-256 for deterministic key computation. Uses Node crypto in tests, expo-crypto at runtime. */
function hashSync(data: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- RN conditional crypto loading
  const { createHash } = require('crypto') as typeof import('crypto');
  return createHash('sha256').update(data).digest('hex').slice(0, 16);
}
```

- [ ] **Step 4: Run tests, commit**

```bash
cd museum-frontend && npm test -- --testPathPattern=cacheKeyParity
git add museum-frontend/features/chat/application/computeLocalCacheKey.ts museum-frontend/__tests__/ museum-frontend/__tests__/fixtures/
git commit -m "feat(chat): add frontend computeLocalCacheKey with backend parity test"
```

---

### Task 16: `dataModeStore` + `DataModeProvider`

**Files:**
- Create: `museum-frontend/features/settings/dataModeStore.ts`
- Create: `museum-frontend/features/chat/application/DataModeProvider.tsx`
- Test: `museum-frontend/__tests__/chat/DataModeProvider.test.tsx`

- [ ] **Step 1: Create the Zustand store**

Create `museum-frontend/features/settings/dataModeStore.ts`:

```typescript
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { storage } from '@/shared/infrastructure/storage';

export type DataModePreference = 'auto' | 'low' | 'normal';

interface DataModePreferenceStore {
  preference: DataModePreference;
  setPreference: (p: DataModePreference) => void;
}

export const useDataModePreferenceStore = create<DataModePreferenceStore>()(
  persist(
    (set) => ({
      preference: 'auto',
      setPreference: (p) => set({ preference: p }),
    }),
    {
      name: 'musaium.dataMode.preference',
      storage: createJSONStorage(() => storage),
    },
  ),
);
```

- [ ] **Step 2: Create the provider**

Create `museum-frontend/features/chat/application/DataModeProvider.tsx` following the code from the design spec section 5.1.

- [ ] **Step 3: Write tests**

Test the 7 resolution scenarios (auto+wifi, auto+2G, auto+4G+expensive, auto+offline, forced low, forced normal, preference change propagation).

- [ ] **Step 4: Run tests, typecheck, commit**

```bash
git add museum-frontend/features/settings/dataModeStore.ts museum-frontend/features/chat/application/DataModeProvider.tsx museum-frontend/__tests__/chat/DataModeProvider.test.tsx
git commit -m "feat(chat): DataModeProvider with NetInfo auto-detect and user override"
```

---

### Task 17: `chatLocalCache` store

**Files:**
- Create: `museum-frontend/features/chat/application/chatLocalCache.ts`
- Test: `museum-frontend/__tests__/chat/chatLocalCache.test.ts`

- [ ] **Step 1: Write tests**

12 tests covering: lookup hit, lookup miss, lookup expired, store, bulkStore, LRU eviction on 201st entry, clearMuseum, pruneExpired, AsyncStorage persistence.

- [ ] **Step 2: Implement the Zustand store**

Following the code from design spec section 5.3. Key points:
- `MAX_LOCAL_ENTRIES = 200`
- `LOCAL_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000`
- LRU eviction removes oldest `cachedAt` entry
- `lookup` checks TTL before returning

- [ ] **Step 3: Run tests, typecheck, commit**

```bash
git add museum-frontend/features/chat/application/chatLocalCache.ts museum-frontend/__tests__/chat/chatLocalCache.test.ts
git commit -m "feat(chat): chatLocalCache Zustand store with LRU eviction and TTL"
```

---

## Milestone E — Frontend Integration

### Task 18: `lowDataPackApi` + `useMuseumPrefetch`

**Files:**
- Create: `museum-frontend/features/museum/infrastructure/lowDataPackApi.ts`
- Create: `museum-frontend/features/museum/application/useMuseumPrefetch.ts`
- Test: `museum-frontend/__tests__/museum/useMuseumPrefetch.test.tsx`

- [ ] **Step 1: Create the API function**

```typescript
import { httpRequest } from '@/shared/api/httpRequest';

import type { LowDataPack } from './lowDataPack.types';

export async function fetchLowDataPack(museumId: string, locale: string): Promise<LowDataPack> {
  return httpRequest<LowDataPack>({
    method: 'GET',
    url: `/museums/${museumId}/low-data-pack`,
    params: { locale },
  });
}
```

- [ ] **Step 2: Create the hook** following design spec section 5.4.

- [ ] **Step 3: Write tests** (8 tests: prefetch on museum change, skip on cellular+lowdata, skip on cooldown, bulkStore called, fail-open, cooldown update).

- [ ] **Step 4: Run tests, typecheck, commit**

```bash
git add museum-frontend/features/museum/ museum-frontend/__tests__/museum/
git commit -m "feat(museum): useMuseumPrefetch hook with low-data pack API"
```

---

### Task 19: `useChatSession` cache-first + `X-Data-Mode` header

**Files:**
- Modify: `museum-frontend/features/chat/application/useChatSession.ts`
- Modify: `museum-frontend/features/chat/infrastructure/chatApi.ts`
- Test: `museum-frontend/__tests__/chat/useChatSession.test.ts` (extend)

- [ ] **Step 1: Add `X-Data-Mode` header to chatApi**

In `chatApi.ts`, in the `postMessage` function, accept a `lowDataMode` boolean and add the header:

```typescript
headers: { 'X-Data-Mode': lowDataMode ? 'low' : 'normal' },
```

- [ ] **Step 2: Add cache-first logic to `useChatSession`**

Following design spec section 5.5. The logic goes before the existing API call in `sendMessage`:
1. If `isLowData && currentMuseumId && !image && messages.length === 0` → lookup cache
2. If hit → render cached, return
3. If miss + offline → queue, return
4. Otherwise → existing API call path + store in cache on success

- [ ] **Step 3: Write 8 new tests for the cache-first behavior**

- [ ] **Step 4: Run tests, typecheck, commit**

```bash
git add museum-frontend/features/chat/ museum-frontend/__tests__/chat/
git commit -m "feat(chat): cache-first logic in useChatSession with X-Data-Mode header"
```

---

## Milestone F — Frontend UI

### Task 20: Settings UI + i18n

**Files:**
- Create: `museum-frontend/features/settings/ui/DataModeSettingsSection.tsx`
- Modify: `museum-frontend/features/settings/ui/SettingsScreen.tsx`
- Modify: `museum-frontend/shared/i18n/locales/{fr,en,es,de,it,pt,ar}.json`
- Test: `museum-frontend/__tests__/settings/DataModeSettingsSection.test.tsx`

- [ ] **Step 1: Add i18n keys to all 7 locale files**

Add these 8 keys to each locale file:
```json
"settings.dataMode.title": "Mode économie de données",
"settings.dataMode.auto": "Automatique",
"settings.dataMode.low": "Économie activée",
"settings.dataMode.normal": "Désactivée",
"settings.dataMode.description": "L'app détecte la qualité de votre connexion",
"chat.lowDataActive": "Mode économie de données actif",
"chat.cachedResponse": "Réponse depuis le cache local",
"chat.savedForLater": "Question sauvegardée pour plus tard"
```

(Translate for en, es, de, it, pt, ar.)

- [ ] **Step 2: Create `DataModeSettingsSection` component**

3-option picker (Auto/Low/Normal) that reads/writes `useDataModePreferenceStore`.

- [ ] **Step 3: Mount in `SettingsScreen`**

- [ ] **Step 4: Write render tests**

- [ ] **Step 5: Run tests, typecheck, commit**

```bash
git add museum-frontend/features/settings/ museum-frontend/shared/i18n/ museum-frontend/__tests__/settings/
git commit -m "feat(settings): DataMode settings section with i18n (7 languages)"
```

---

### Task 21: Chat UI — cached badge + OfflineBanner

**Files:**
- Modify: `museum-frontend/features/chat/ui/ChatMessageBubble.tsx`
- Modify: `museum-frontend/features/chat/ui/OfflineBanner.tsx`
- Test: extend existing tests

- [ ] **Step 1: Add cached badge to `ChatMessageBubble`**

When `message.cached === true`, render a small icon + text badge below the message.

- [ ] **Step 2: Extend `OfflineBanner` for low-data state**

Show "Mode économie de données actif" when `isLowData && isConnected`.

- [ ] **Step 3: Write/extend render tests**

- [ ] **Step 4: Commit**

```bash
git add museum-frontend/features/chat/ui/ museum-frontend/__tests__/chat/
git commit -m "feat(chat): cached response badge and low-data banner"
```

---

### Task 22: Mount `DataModeProvider` in app layout

**Files:**
- Modify: `museum-frontend/app/_layout.tsx`

- [ ] **Step 1: Wrap the app tree**

```typescript
import { DataModeProvider } from '@/features/chat/application/DataModeProvider';

// Inside the layout component, wrap existing providers:
<DataModeProvider>
  {/* existing children */}
</DataModeProvider>
```

- [ ] **Step 2: Typecheck, run tests, commit**

```bash
git add museum-frontend/app/_layout.tsx
git commit -m "feat(app): mount DataModeProvider in root layout"
```

---

## Milestone G — Final Verification

### Task 23: Regenerate OpenAPI types frontend

- [ ] **Step 1: Regenerate**

```bash
cd museum-frontend && npm run generate:openapi-types
```

- [ ] **Step 2: Verify sync**

```bash
cd museum-frontend && npm run check:openapi-types
```

- [ ] **Step 3: Commit if changed**

```bash
git add museum-frontend/shared/api/generated/
git commit -m "chore(frontend): regenerate OpenAPI types for low-data-pack endpoint"
```

---

### Task 24: Frontend quality gate

- [ ] **Step 1: Typecheck**

```bash
cd museum-frontend && npm run lint
```

Expected: 0 errors.

- [ ] **Step 2: Full test suite**

```bash
cd museum-frontend && npm test
```

Expected: All tests PASS (1052 existing + ~50 new = 1102 target).

---

### Task 25: Full stack quality gate + final commit

- [ ] **Step 1: Backend tsc + tests**

```bash
cd museum-backend && pnpm lint && pnpm test 2>&1 | tail -5
```

- [ ] **Step 2: Frontend tsc + tests**

```bash
cd museum-frontend && npm run lint && npm test 2>&1 | tail -5
```

- [ ] **Step 3: Verify rollback**

Set `CACHE_ENABLED=false` temporarily and verify backend starts without errors and all tests pass.

- [ ] **Step 4: Final commit with all remaining changes**

```bash
git add -A
git commit -m "feat: Smart Low-Data Mode — shared LLM cache, contextual pre-fetch, graceful degradation"
```
