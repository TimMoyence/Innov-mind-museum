# G — LLM Response Cache (exact-match + per-user scope)

**Date:** 2026-05-01
**Subsystem:** G of A→H scale-hardening decomposition
**Status:** Approved (autonomous mode)
**Predecessors:** F infra (Redis cluster toggle ready)
**Successors:** H observability (cache hit ratio is a key SLO metric)

---

## 1. Context

The chat module sends every user prompt to OpenAI / Deepseek / Google.
Each call costs $0.001-$0.01 and adds 1-5 seconds latency. Many prompts
are repeated verbatim (popular museum questions, identical first-launch
flows, demo accounts). At 100K rps target this becomes the dominant cost.

A cache layer between `chat.service.ts` and the LLM orchestrator turns
repeats into Redis hits — single-digit-millisecond latency, $0.

## 2. Scope — Phase 1 (this spec)

**In scope:**
- Exact-match LLM response cache. Key = stable hash of `{model, prompt,
  systemSection, locale, museumContext, userPreferences}`.
- Per-user scope baked into the key (`userId` or `anon` for anonymous
  sessions). Different users with the same prompt get separate cache
  entries — protects personalised guidance from leaking across users.
- Adaptive TTL by context class:
  - **Generic** (no museum context, no user preferences) — 7 days.
  - **Museum-mode** (specific museum context) — 24 hours.
  - **Personalized** (uses user memory or sessionContext) — 1 hour.
- Cache hit / miss metric per request (event log; subsystem H wires the
  Grafana dashboard).
- Cache bypass on stream / TTS responses (audio is already cached
  separately on `chat_messages.audioUrl`).

**Out of scope (G Phase 2 follow-up spec):**
- Semantic similarity matching (embedding-based near-duplicate detection).
  Requires OpenAI text-embedding-3-small calls + cosine similarity index;
  separate cost + latency analysis.
- Stale-while-revalidate (return stale cached + fire async refresh).
- Negative caching (cache "I don't know" responses).
- Cache warming (pre-populate top-N popular queries).

## 3. Architecture

### 3.1 Service shape

`museum-backend/src/modules/chat/useCase/llm-cache.service.ts` (new):

```ts
export type LlmContextClass = 'generic' | 'museum-mode' | 'personalized';

export interface LlmCacheKeyInput {
  /** OpenAI / Deepseek / Google model id. */
  model: string;
  /** User identity scope. `'anon'` for unauthenticated. */
  userId: number | 'anon';
  /** The system instruction section. Stable per use case. */
  systemSection: string;
  /** Locale code (response language). */
  locale: string;
  /** Optional museum context (museum_id + name + visit context). */
  museumContext?: { museumId?: number | null; museumName?: string | null };
  /** User preferences slice (notable artworks, level, etc). Hash only. */
  userPreferencesHash?: string;
  /** The user-typed prompt text. */
  prompt: string;
}

export interface LlmCacheLookupResult<T> {
  hit: boolean;
  value: T | null;
  contextClass: LlmContextClass;
}

export interface LlmCacheService {
  classify(input: LlmCacheKeyInput): LlmContextClass;
  lookup<T>(input: LlmCacheKeyInput): Promise<LlmCacheLookupResult<T>>;
  store<T>(input: LlmCacheKeyInput, value: T): Promise<void>;
  /** Manual invalidation entry point (e.g. when admin updates museum_enrichment). */
  invalidateMuseum(museumId: number): Promise<void>;
}
```

### 3.2 Key shape

`llm:v1:{contextClass}:{userIdOrAnon}:{museumId|none}:{sha256}`

The `sha256` is `sha256(JSON.stringify(canonicalize(input)))` — sorted-key
JSON of the input minus volatile fields (request_id, timestamp). Stable
across calls.

The `contextClass` and `userIdOrAnon` segments support `delByPrefix`
invalidation:
- `llm:v1:museum-mode:*:42:*` — invalidate everything for museum 42.
- `llm:v1:personalized:42:*` — invalidate everything for user 42.

### 3.3 TTL table

| ContextClass | TTL | Rationale |
|---|---|---|
| `generic` | 604800s (7 days) | Stable across deploys; "What is impressionism?" doesn't change. |
| `museum-mode` | 86400s (1 day) | Museum enrichment refreshes daily; admission fees + opening hours can change. |
| `personalized` | 3600s (1 hour) | User memory drifts within a session; next turn deserves fresh context. |

Hardcoded constants in the service. Override via env if operator needs
to tune (defer to G2 if real demand shows up).

### 3.4 Wire-in point — chat.service.ts

Today `chat.service.ts` calls `langchain.orchestrator.run(prompt, …)`
unconditionally. Wrap the call:

```ts
const cacheInput = buildCacheInput(prompt, sessionCtx, userMemory);
const cached = await llmCache.lookup<AssistantResult>(cacheInput);
if (cached.hit && cached.value) {
  logger.info('llm_cache_hit', { contextClass: cached.contextClass, … });
  return cached.value;
}

const fresh = await orchestrator.run(prompt, …);
await llmCache.store(cacheInput, fresh);
logger.info('llm_cache_miss', { contextClass: cached.contextClass, … });
return fresh;
```

### 3.5 Bypass conditions

Cache is bypassed when:
- The request specifies `?nocache=1` (admin debug).
- `env.llm.cacheEnabled === false` (kill switch).
- The orchestrator is in streaming mode (SSE — separate path, not cacheable
  as a whole response).
- The request includes audio TTS — TTS audio is cached separately on
  `chat_messages.audioUrl`.

### 3.6 Personalized scope key derivation

For `userPreferencesHash`, the service computes a SHA256 over a stable
projection of the user memory + content preferences. When user memory
updates, this hash changes → next call misses cache → fresh LLM run.
This is the right behavior — personalization changed, prior cached
response is stale by definition.

For `museumContext`, the museum_id + museum_name slice is hashed in.
When admin updates museum_enrichment, the controller calls
`llmCache.invalidateMuseum(museumId)` to drop all related entries.

---

## 4. Files

```
museum-backend/src/modules/chat/useCase/
├── llm-cache.service.ts                   NEW — service implementation
└── llm-cache.types.ts                     NEW — interface, types, key-builder

museum-backend/src/modules/chat/useCase/
└── chat.service.ts                        MODIFY — wrap orchestrator.run()

museum-backend/src/modules/chat/chat-module.ts MODIFY — wire LlmCacheService

museum-backend/src/config/env.ts            MODIFY — LLM_CACHE_ENABLED + TTL knobs
museum-backend/src/config/env.types.ts      MODIFY — types

museum-backend/tests/unit/chat/
├── llm-cache.service.test.ts              NEW — unit
└── chat-service-cache-wrap.test.ts        NEW — integration (mocked orchestrator + cache)
```

---

## 5. Acceptance criteria

- LlmCacheService implemented + 6+ unit tests passing.
- chat.service.ts wraps orchestrator.run with cache lookup + store.
- Cache hit logs `llm_cache_hit` event; miss logs `llm_cache_miss`.
- TTL adaptive per ContextClass.
- `invalidateMuseum` works (test asserts `delByPrefix` called with the right
  pattern).
- `env.llm.cacheEnabled = false` bypasses cache (test asserts).
- Existing chat tests pass unchanged.
- `pnpm exec tsc --noEmit` clean. Lint clean. Drift clean.

## 6. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Per-user scope bloats key space — many anonymous users with same prompt = N copies. | The `'anon'` key + identical prompt collapses to one entry per anonymous prompt (no userId variation). Authenticated users do get separate entries by design. |
| Cache returns stale museum data after admin update. | Manual `invalidateMuseum` hook. Admin update calls it from the museum-update use case. |
| User PII in cache key (prompt text + museumName + user memory). | `userPreferencesHash` is a SHA256 — no plain PII. The prompt itself goes into the hash, not a stored value as plaintext. The cached VALUE is the LLM response (already user-facing); not new PII. |
| Cache bypasses streaming responses → no benefit for SSE clients. | Acceptable — streaming UX and cache UX are different. Most chat traffic is non-streaming today. |
| First request always misses → no benefit for cold paths. | Acceptable for Phase 1. G2 (semantic similarity) addresses near-duplicate misses; warming addresses cold-popular cases. |

## 7. Out of scope (G Phase 2)

- Semantic similarity (embedding-based near-duplicate matching).
- Cache warming (pre-populate popular queries on deploy).
- Stale-while-revalidate.
- Negative caching.
- Per-user cost accounting (count cache savings $$$ per userId).
