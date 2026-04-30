# Smart Low-Data Mode — Design Specification

**Date** : 2026-04-07
**Status** : Approved
**Mode** : Feature (enterprise pipeline)
**Estimated effort** : 3 weeks
**Roadmap reference** : Phase 2 — Navigation & Low-Data Resilience (cf. `team-reports/2026-04-06-audit-complet.md`)

---

## 1. Context & Motivation

Musaium is an interactive museum assistant. Visitors photograph artworks or ask questions and receive AI-powered contextual responses via LangChain + LLM. The current architecture assumes good network connectivity, but the reality of museums is:

- **Spotty cellular signal** (thick walls, basements, crowds)
- **Roaming tourists** wanting to minimize data usage
- **Slow networks** (2G/3G in some venues, congested wifi)

The previously planned "Full Offline Mode" was overkill — visitors are not truly offline, they have intermittent low-quality connectivity. Smart Low-Data Mode addresses this by:

1. **Sharing LLM responses across users** via a Redis cache (one visitor's question caches the answer for the next)
2. **Pre-fetching contextual content** when entering a museum (top Q&A for that venue)
3. **Gracefully degrading UX** when the network is slow (cache-first lookup, queue for offline)
4. **Adaptive prompts** that produce shorter responses when bandwidth is constrained

---

## 2. Decisions Summary

| Topic | Decision | Rationale |
|-------|----------|-----------|
| **Cache granularity** | Hybrid: exact hash + per-museum FAQ pre-load | Safe (no semantic drift) + high hit rate via pre-fetch |
| **Pre-fetch strategy** | Hybrid: minimal seed + organic accumulation | Avoids cold start + grows with usage |
| **Graceful degradation** | Auto-detect (NetInfo) + user override toggle | Zero-config UX + user control for roaming |
| **Adaptive prompts** | Hybrid: client header + server-side cache-first front | Clean separation: client knows network state, server knows prompt strategy |
| **Cache invalidation** | TTL 7 days + thumbs-down feedback hook | Auto-correction via existing 👎 system |

---

## 3. Architecture Overview

```
┌─────────────────────────── FRONTEND (Expo / RN) ──────────────────────────┐
│                                                                            │
│  ┌─ Settings ──────────┐     ┌─ NetInfo Monitor ──┐                       │
│  │ "Mode économie data"│     │ effectiveType +    │                       │
│  │ toggle Zustand      │     │ latency probe      │                       │
│  └──────────┬──────────┘     └─────────┬──────────┘                       │
│             │                          │                                   │
│             └──────────┬───────────────┘                                   │
│                        ▼                                                   │
│         ┌─ DataModeProvider (context) ─┐                                  │
│         │ resolved: 'low' | 'normal'   │                                  │
│         └──────────┬───────────────────┘                                  │
│                    │                                                       │
│   ┌────────────────┼────────────────────────┐                             │
│   ▼                ▼                        ▼                              │
│ ┌─ useChatSession ─┐  ┌─ MuseumPrefetch ─┐  ┌─ ChatLocalCache ───┐        │
│ │ 1. cache lookup  │  │ on museum select:│  │ Zustand store     │        │
│ │ 2. if hit → use  │  │ GET /museums/:id │  │ persist 200 Q&A   │        │
│ │ 3. else → API    │  │ /low-data-pack   │  │ key=hash(...)     │        │
│ │    + X-Data-Mode │  │ → store local    │  │ TTL 7d local      │        │
│ │ 4. else → queue  │  └──────────────────┘  └────────────────────┘        │
│ └──────────────────┘                                                       │
│         │                                                                  │
└─────────┼──────────────────────────────────────────────────────────────────┘
          │  HTTP + X-Data-Mode header
          ▼
┌──────────────────────── BACKEND (Express + LangChain) ─────────────────────┐
│                                                                            │
│  POST /chat/sessions/:id/messages                                          │
│         │                                                                  │
│         ▼                                                                  │
│  ┌─ ChatMessageService.postMessage() ─────────────┐                       │
│  │   prepare → guardrail → orchestrator.generate() │                       │
│  └────────────────────────┬───────────────────────┘                       │
│                           │                                                │
│                           ▼                                                │
│        ┌─ CachingChatOrchestrator (NEW) ─┐                                │
│        │ 1. shouldCache(input)?          │                                │
│        │    skip if image/history/PII    │                                │
│        │ 2. cache.get(hash)              │                                │
│        │    HIT → return + bump counter  │                                │
│        │ 3. delegate.generate()          │                                │
│        │ 4. cache.set(hash, output, 7d)  │                                │
│        └─────────────┬───────────────────┘                                │
│                      │                                                     │
│                      ▼                                                     │
│        ┌─ FallbackChatOrchestrator ──┐                                    │
│        │ LangChain → Deepseek → ...  │                                    │
│        └─────────────────────────────┘                                    │
│                                                                            │
│  GET /museums/:id/low-data-pack    ◄─── pre-fetch endpoint                │
│  POST /messages/:id/feedback       ◄─── 👎 → cache.del(hash)              │
│  POST /admin/museums/:id/cache/purge  ◄─ admin manual purge               │
│                                                                            │
│        ┌─ Redis (existing) ─────────────┐                                 │
│        │ chat:llm:{museumId}:{hash}     │  TTL 7d                         │
│        │ chat:llm:popular:{museumId}    │  ZSET sorted by hit count       │
│        │ kb:wikidata:{searchTerm}       │  upgrade from in-memory         │
│        └────────────────────────────────┘                                 │
└────────────────────────────────────────────────────────────────────────────┘
```

**Key principles** :

- **Backend** : One new component (`CachingChatOrchestrator`) wraps `FallbackChatOrchestrator` via the `ChatOrchestrator` port. Transparent to all callers.
- **Frontend** : Three new modules (`DataModeProvider`, `MuseumPrefetch`, `ChatLocalCache`) compose into the existing `useChatSession` hook.
- **Cache key** : `chat:llm:{museumId}:{sha256(text + locale + guideLevel + museumMode).slice(0,16)}` — shared across users of the same museum.
- **Pre-fetch endpoint** : `GET /museums/:id/low-data-pack` returns top 30 cached responses + 5-10 seeded Q&A.
- **Knowledge Base upgrade** : `KnowledgeBaseService` in-memory cache migrates to Redis (cross-instance sharing — bonus gain).

**What does NOT change** :
- `ChatMessageService` (only new wiring in `ChatModule`)
- `FallbackChatOrchestrator` and `LangChainChatOrchestrator`
- Existing routes
- Frontend `OfflineQueue` (reused for queueing requests in low-data mode without cache hit)

---

## 4. Backend Components

### 4.1 — `CachingChatOrchestrator` (new secondary adapter)

**File** : `museum-backend/src/modules/chat/adapters/secondary/caching-chat-orchestrator.ts`

```typescript
export interface CachingChatOrchestratorDeps {
  delegate: ChatOrchestrator;        // Real orchestrator (FallbackChatOrchestrator)
  cache: CacheService;                // Existing Redis CacheService
  ttlSeconds: number;                 // 7 days = 604800
  popularityZsetTtlSeconds: number;   // 30 days for popularity tracking
  piiSanitizer: PiiSanitizer;         // Existing privacy gate
}

export class CachingChatOrchestrator implements ChatOrchestrator {
  async generate(input: OrchestratorInput): Promise<OrchestratorOutput> {
    if (!this.shouldCache(input)) {
      return this.delegate.generate(input);
    }

    const key = this.buildCacheKey(input);
    const cached = await this.cache.get<CachedOrchestratorOutput>(key);
    if (cached && cached.originalText === this.normalizeQuestion(input.text!)) {
      logger.info('llm_cache_hit', { museumId: this.extractMuseumId(input), key });
      await this.bumpPopularity(input, key);
      return this.deserializeOutput(cached);
    }

    const output = await this.delegate.generate(input);
    await this.cache.set(key, this.serializeOutput(output, input), this.ttlSeconds);
    await this.bumpPopularity(input, key);
    return output;
  }

  async generateStream(input, onChunk): Promise<OrchestratorOutput> {
    if (this.shouldCache(input)) {
      const key = this.buildCacheKey(input);
      const cached = await this.cache.get<CachedOrchestratorOutput>(key);
      if (cached && cached.originalText === this.normalizeQuestion(input.text!)) {
        await this.replayCachedAsStream(cached.text, onChunk);
        await this.bumpPopularity(input, key);
        return this.deserializeOutput(cached);
      }
    }

    let fullText = '';
    const output = await this.delegate.generateStream(input, (chunk) => {
      fullText += chunk;
      onChunk(chunk);
    });

    if (this.shouldCache(input)) {
      const key = this.buildCacheKey(input);
      await this.cache.set(key, this.serializeOutput(output, input), this.ttlSeconds);
      await this.bumpPopularity(input, key);
    }

    return output;
  }

  private shouldCache(input: OrchestratorInput): boolean {
    return (
      input.museumMode === true &&
      !input.image &&
      input.history.length === 0 &&
      !!input.text && input.text.length < 500 &&
      !input.userMemoryBlock &&                                  // privacy gate
      !this.piiSanitizer.containsPii(input.text) &&              // privacy gate
      this.extractMuseumId(input) !== null
    );
  }

  private buildCacheKey(input: OrchestratorInput): string {
    const museumId = this.extractMuseumId(input)!;
    const normalized = this.normalizeQuestion(input.text!);
    const components = [
      normalized,
      input.locale ?? 'fr',
      input.context?.guideLevel ?? 'beginner',
      input.audioDescriptionMode ? '1' : '0',
    ].join('|');
    const hash = sha256(components).slice(0, 16);
    return `chat:llm:${museumId}:${hash}`;
  }

  private normalizeQuestion(text: string): string {
    return text.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  private extractMuseumId(input: OrchestratorInput): string | null {
    return input.visitContext?.museumId ?? input.context?.location ?? null;
  }

  private async bumpPopularity(input: OrchestratorInput, key: string): Promise<void> {
    const museumId = this.extractMuseumId(input);
    if (!museumId) return;
    await this.cache.zadd(`chat:llm:popular:${museumId}`, key, 1);
  }

  private async replayCachedAsStream(text: string, onChunk: (c: string) => void): Promise<void> {
    const CHUNK_SIZE = 8;
    const CHUNK_DELAY_MS = 25;
    for (let i = 0; i < text.length; i += CHUNK_SIZE) {
      onChunk(text.slice(i, i + CHUNK_SIZE));
      await new Promise<void>((r) => setTimeout(r, CHUNK_DELAY_MS));
    }
  }
}
```

**Key decisions** :

- **No cache for images** : each photo is unique
- **No cache for multi-turn conversations** : history makes the request user-specific
- **No cache outside museum mode** : limits scope to validated use case
- **Cache key includes `museumId`** : enables `delByPrefix(\`chat:llm:${museumId}:\`)` for per-museum purge
- **Streaming preserved** : on cache hit during streaming, replay tokens at ~25ms intervals to preserve UX
- **Hash collision protection** : `originalText` stored alongside cached value, verified on hit

### 4.2 — `CacheService` port extension

**Modified file** : `museum-backend/src/shared/cache/cache.port.ts`

```typescript
export interface CacheService {
  // ... existing methods (get, set, del, delByPrefix, setNx, ping)

  /** Increment a counter in a sorted set (used for popularity tracking). */
  zadd(key: string, member: string, increment: number): Promise<void>;

  /** Get top N members of a sorted set by score (descending). */
  ztop(key: string, n: number): Promise<{ member: string; score: number }[]>;
}
```

Implementations updated in `RedisCacheService` (uses `ZINCRBY` + `ZREVRANGE WITHSCORES`) and `NoopCacheService` (no-op).

### 4.3 — `LowDataPackService` (new use case)

**File** : `museum-backend/src/modules/museum/useCase/low-data-pack.service.ts`

```typescript
export interface LowDataPackEntry {
  question: string;
  answer: string;
  metadata?: ChatAssistantMetadata;
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
    const popular = await this.cache.ztop(`chat:llm:popular:${museumId}`, this.maxEntries);

    const cachedAnswers: LowDataPackEntry[] = [];
    for (const { member, score } of popular) {
      const value = await this.cache.get<CachedOrchestratorOutput>(member);
      if (value && value.locale === locale) {
        cachedAnswers.push({
          question: value.originalText,
          answer: value.text,
          metadata: value.metadata,
          hits: score,
          source: 'cache',
        });
      }
    }

    const seeded = await this.seedRepo.findByMuseumAndLocale(museumId, locale);
    const seededEntries: LowDataPackEntry[] = seeded.map((s) => ({
      question: s.question,
      answer: s.answer,
      metadata: s.metadata as ChatAssistantMetadata | undefined,
      source: 'seeded',
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

### 4.4 — `MuseumQaSeed` entity (new)

**File** : `museum-backend/src/modules/museum/domain/museumQaSeed.entity.ts`

```typescript
@Entity('museum_qa_seed')
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

**Migration** : auto-generated via `node scripts/migration-cli.cjs generate --name=AddMuseumQaSeed`. Reversible (`down()` drops table + index).

Seed data (5-10 Q&A per museum) is added manually via SQL or admin tooling **outside this PR scope**.

### 4.5 — HTTP routes

**New routes** :

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/museums/:id/low-data-pack?locale=fr` | Public | Returns the `LowDataPack` for a museum. Cache-Control: public, max-age=3600 |
| `POST` | `/admin/museums/:id/cache/purge` | Admin role | Purges all `chat:llm:{museumId}:*` keys. Returns `{ deletedKeys, durationMs }`. Audit logged. Rate limited 10/min/admin. |

**Modified route** :

`POST /messages/:messageId/feedback` (existing) — when `value === 'negative'`:
1. Fetch the original user message (preceding message in session)
2. Recompute the cache key using the same `buildCacheKey()` logic (extracted to a shared util `chat-cache-key.util.ts`)
3. Call `cache.del(key)` (fail-open)
4. Log `llm_cache_invalidated_by_feedback` event

**Header support** : `X-Data-Mode: low | normal`
- Parsed in `chat.contracts.ts` (default `normal`)
- Added to CORS `Access-Control-Allow-Headers`
- Propagated to `OrchestratorInput.lowDataMode: boolean`
- `LangChainChatOrchestrator` reads `lowDataMode`: when true, system prompt includes `"Provide a concise factual answer in 100-150 tokens maximum"` and `max_tokens` reduced to 200

### 4.6 — `KnowledgeBaseService` Redis upgrade (bonus)

**Modified file** : `museum-backend/src/modules/chat/useCase/knowledge-base.service.ts`

Replace the `Map<string, CacheEntry>` in-memory cache with `CacheService` calls (prefix `kb:wikidata:`). Gain : shared cache across instances, no rebuild after restart.

Eviction is now Redis TTL-based (no manual `evictIfNeeded` needed).

### 4.7 — Wiring in `ChatModule`

**Modified file** : `museum-backend/src/modules/chat/index.ts`

```typescript
const baseOrchestrator = new FallbackChatOrchestrator([...]);

const orchestrator = env.cache?.enabled
  ? new CachingChatOrchestrator({
      delegate: baseOrchestrator,
      cache: cacheService,
      ttlSeconds: env.cache.llmTtlSeconds ?? 604_800,
      popularityZsetTtlSeconds: 2_592_000,
      piiSanitizer: piiSanitizer,
    })
  : baseOrchestrator;
```

If `CACHE_ENABLED=false`, the decorator is not instantiated — current behaviour preserved. Clean rollback toggle.

### 4.8 — Environment configuration

**Modified file** : `museum-backend/src/config/env.ts`

```typescript
cache: {
  // ... existing fields
  llmTtlSeconds: int().min(60).max(31_536_000).default(604_800),
  llmPopularityTtlSeconds: int().min(3600).max(31_536_000).default(2_592_000),
  lowDataPackMaxEntries: int().min(5).max(100).default(30),
}
```

### 4.9 — Backend file inventory

| Type | Path | Estimated LoC |
|------|------|---------------|
| NEW | `chat/adapters/secondary/caching-chat-orchestrator.ts` | ~180 |
| NEW | `chat/useCase/chat-cache-key.util.ts` (shared key builder) | ~30 |
| NEW | `museum/useCase/low-data-pack.service.ts` | ~80 |
| NEW | `museum/domain/museumQaSeed.entity.ts` | ~25 |
| NEW | `museum/domain/museumQaSeed.repository.interface.ts` | ~10 |
| NEW | `museum/adapters/secondary/museum-qa-seed.repository.typeorm.ts` | ~40 |
| NEW | `museum/adapters/primary/http/low-data-pack.route.ts` | ~50 |
| NEW | `admin/adapters/primary/http/cache-purge.route.ts` | ~60 |
| NEW | `data/db/migrations/<timestamp>-AddMuseumQaSeed.ts` | ~30 |
| MOD | `shared/cache/cache.port.ts` (zadd/ztop) | +10 |
| MOD | `shared/cache/redis-cache.service.ts` (zadd/ztop) | +30 |
| MOD | `shared/cache/noop-cache.service.ts` (zadd/ztop) | +10 |
| MOD | `chat/useCase/knowledge-base.service.ts` (Redis migration) | ~40 net |
| MOD | `chat/index.ts` (wiring) | +15 |
| MOD | `chat/useCase/chat-media.service.ts` (feedback hook) | +20 |
| MOD | `chat/adapters/primary/http/chat.contracts.ts` (X-Data-Mode) | +10 |
| MOD | `chat/domain/ports/chat-orchestrator.port.ts` (lowDataMode field) | +2 |
| MOD | `chat/adapters/secondary/langchain.orchestrator.ts` (lowDataMode prompt) | +15 |
| MOD | `config/env.ts` (cache.llmTtlSeconds + 2 others) | +5 |
| MOD | `museum/index.ts` (wire LowDataPackService) | +10 |
| MOD | `app.ts` or middleware (CORS X-Data-Mode header) | +3 |

**Total backend** : 9 new files, 12 modifications, ~640 LoC added.

---

## 5. Frontend Components

### 5.1 — `DataModeProvider` (new context)

**File** : `museum-frontend/features/chat/application/DataModeProvider.tsx`

```typescript
type DataModePreference = 'auto' | 'low' | 'normal';
type ResolvedDataMode = 'low' | 'normal';

interface DataModeContextValue {
  preference: DataModePreference;
  resolved: ResolvedDataMode;
  isLowData: boolean;
  setPreference: (p: DataModePreference) => void;
}

export function DataModeProvider({ children }: { children: ReactNode }) {
  const preference = useDataModePreferenceStore((s) => s.preference);
  const setPreference = useDataModePreferenceStore((s) => s.setPreference);
  const netInfo = useNetInfo();

  const resolved = useMemo<ResolvedDataMode>(() => {
    if (preference === 'low') return 'low';
    if (preference === 'normal') return 'normal';
    if (netInfo.isConnected === false) return 'low';
    if (netInfo.type === 'cellular') {
      const gen = netInfo.details?.cellularGeneration;
      if (gen === '2g' || gen === '3g') return 'low';
    }
    if (netInfo.details?.isConnectionExpensive === true) return 'low';
    return 'normal';
  }, [preference, netInfo]);

  const value = useMemo(
    () => ({ preference, resolved, isLowData: resolved === 'low', setPreference }),
    [preference, resolved, setPreference],
  );

  return <DataModeContext.Provider value={value}>{children}</DataModeContext.Provider>;
}
```

**Decisions** :
- No active latency probe (battery cost) — NetInfo is sufficient for v1
- Simple heuristic: 2G/3G or expensive connection → low ; otherwise → normal
- User toggle always overrides auto-detection

### 5.2 — `useDataModePreferenceStore` (Zustand persist)

**File** : `museum-frontend/features/settings/dataModeStore.ts`

```typescript
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

### 5.3 — `chatLocalCache` (new Zustand store)

**File** : `museum-frontend/features/chat/application/chatLocalCache.ts`

```typescript
interface CachedAnswer {
  question: string;
  answer: string;
  metadata?: ChatAssistantMetadata;
  museumId: string;
  locale: string;
  guideLevel?: string;
  cachedAt: number;
  source: 'prefetch' | 'previous-call';
}

interface ChatLocalCacheStore {
  entries: Record<string, CachedAnswer>;
  lookup(input: LookupInput): CachedAnswer | null;
  store(entry: CachedAnswer): void;
  bulkStore(entries: CachedAnswer[]): void;
  clearMuseum(museumId: string): void;
  pruneExpired(): void;
}

const MAX_LOCAL_ENTRIES = 200;
const LOCAL_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
```

**Decisions** :
- No expo-sqlite — AsyncStorage + Zustand persist sufficient for 200 entries (~500KB max)
- Hash strictly identical to backend (parity test in CI)
- LRU eviction on 201st entry
- TTL 7 days aligned with backend

### 5.4 — `useMuseumPrefetch` (new hook)

**File** : `museum-frontend/features/museum/application/useMuseumPrefetch.ts`

```typescript
const PREFETCH_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export function useMuseumPrefetch(museumId: string | null, locale: string) {
  const bulkStore = useChatLocalCache((s) => s.bulkStore);
  const { isLowData } = useDataMode();

  useEffect(() => {
    if (!museumId) return;

    const lastPrefetchKey = `prefetch:${museumId}:${locale}`;
    const lastPrefetchAt = getLastPrefetchTimestamp(lastPrefetchKey);
    if (lastPrefetchAt && Date.now() - lastPrefetchAt < PREFETCH_COOLDOWN_MS) return;

    NetInfo.fetch().then((info) => {
      if (info.type !== 'wifi' && isLowData) return;

      fetchLowDataPack(museumId, locale)
        .then((pack) => {
          bulkStore(
            pack.entries.map((e) => ({
              question: e.question,
              answer: e.answer,
              metadata: e.metadata,
              museumId,
              locale,
              cachedAt: Date.now(),
              source: 'prefetch' as const,
            })),
          );
          setLastPrefetchTimestamp(lastPrefetchKey, Date.now());
        })
        .catch(() => {
          /* fail-open */
        });
    });
  }, [museumId, locale, bulkStore, isLowData]);
}
```

**Trigger** : called from the hook detecting active museum changes (probably `MuseumProvider` or `useChatSession`).

### 5.5 — `useChatSession` cache-first integration

**Modified file** : `museum-frontend/features/chat/application/useChatSession.ts`

```typescript
async function sendMessage(text: string, image?: ImageInput) {
  // ... existing optimistic UI update

  if (isLowData && currentMuseumId && !image && messages.length === 0) {
    const cached = chatLocalCache.lookup({
      text,
      museumId: currentMuseumId,
      locale,
      guideLevel,
    });

    if (cached) {
      addAssistantMessage({
        text: cached.answer,
        metadata: cached.metadata,
        cached: true,
      });
      return;
    }
  }

  if (isLowData && !isConnected) {
    offlineQueue.enqueue({ sessionId, text, imageUri: image?.uri });
    addSystemMessage({ text: t('chat.savedForLater'), kind: 'info' });
    return;
  }

  try {
    const response = await chatApi.postMessage({
      sessionId,
      text,
      image,
      headers: { 'X-Data-Mode': isLowData ? 'low' : 'normal' },
    });

    if (currentMuseumId && !image && messages.length === 0) {
      chatLocalCache.store({
        question: text,
        answer: response.message.text,
        metadata: response.metadata,
        museumId: currentMuseumId,
        locale,
        guideLevel,
        cachedAt: Date.now(),
        source: 'previous-call',
      });
    }

    addAssistantMessage(response.message);
  } catch (err) {
    // ... existing error handling
  }
}
```

### 5.6 — UI components

**`SettingsScreen`** : new "Mode économie de données" section with 3-option picker (Auto / Économie / Désactivée).

**`ChatMessageBubble`** : optional `cached` badge (small icon) when `message.cached === true`.

**`OfflineBanner`** : extended to display low-data state in addition to offline state.

### 5.7 — i18n keys (8 new)

Added across all 7 languages (`fr, en, es, de, it, pt, ar`):

- `settings.dataMode.title`
- `settings.dataMode.auto`
- `settings.dataMode.low`
- `settings.dataMode.normal`
- `settings.dataMode.description`
- `chat.lowDataActive`
- `chat.cachedResponse`
- `chat.savedForLater`

### 5.8 — Frontend file inventory

| Type | Path | Estimated LoC |
|------|------|---------------|
| NEW | `features/chat/application/DataModeProvider.tsx` | ~80 |
| NEW | `features/chat/application/chatLocalCache.ts` | ~120 |
| NEW | `features/chat/application/computeLocalCacheKey.ts` | ~30 |
| NEW | `features/settings/dataModeStore.ts` | ~30 |
| NEW | `features/museum/application/useMuseumPrefetch.ts` | ~70 |
| NEW | `features/museum/infrastructure/lowDataPackApi.ts` | ~40 |
| NEW | `features/settings/ui/DataModeSettingsSection.tsx` | ~80 |
| MOD | `features/chat/application/useChatSession.ts` | +60 |
| MOD | `features/chat/infrastructure/chatApi.ts` (X-Data-Mode header) | +15 |
| MOD | `features/chat/ui/ChatMessageBubble.tsx` (cached badge) | +20 |
| MOD | `features/chat/ui/OfflineBanner.tsx` (low-data state) | +15 |
| MOD | `features/settings/ui/SettingsScreen.tsx` (mount section) | +5 |
| MOD | `app/_layout.tsx` (mount DataModeProvider) | +3 |
| MOD | `shared/i18n/locales/{fr,en,es,de,it,pt,ar}.json` (8 keys × 7 langs) | +56 |
| MOD | `shared/api/generated/openapi.ts` (regenerated) | +20 |

**Total frontend** : 7 new files, 8 modifications, ~640 LoC added.

---

## 6. Data Flow Scenarios

### 6.1 — Scenario 1: Cache hit (the happy path)

1. Visitor selects a previously-visited museum
2. `useMuseumPrefetch` triggers `GET /museums/louvre/low-data-pack` (skipped if low-data AND not wifi, to avoid burning expensive cellular data)
3. 30 entries stored in `chatLocalCache`
4. Visitor types "Qui a peint la Joconde ?"
5. `DataModeProvider` resolves to `low` (cellular 4G + isExpensive)
6. `useChatSession.sendMessage` calls `chatLocalCache.lookup` → hit
7. Assistant message rendered with `cached: true` badge
8. **Zero API call, ~50ms latency, zero data consumed**

### 6.2 — Scenario 2: Cache miss → backend cache hit

1. Visitor types a question not in the pre-fetched pack
2. Local cache miss → API call with `X-Data-Mode: low`
3. `CachingChatOrchestrator.generate` computes key, calls `cache.get` → Redis hit (another visitor cached it)
4. `bumpPopularity` increments the ZSET counter
5. Returns cached output → `ChatMessageService` writes DB → HTTP 200
6. Frontend stores in local cache for next time
7. **No LLM call, ~300ms latency (DB write only)**

### 6.3 — Scenario 3: Full cache miss → LLM call

1. Visitor asks a rare question
2. Local cache miss + Redis miss
3. `CachingChatOrchestrator` delegates to `FallbackChatOrchestrator`
4. LLM called with `lowDataMode=true` → shorter response (max 200 tokens)
5. Response cached in Redis (`cache.set` + `bumpPopularity`)
6. Returns to frontend → stored locally
7. **One LLM call, ~5s latency, but shorter response = less data**

### 6.4 — Scenario 4: Invalidation by 👎 feedback

1. Visitor receives a cached response that is incorrect (artwork moved, info outdated)
2. Visitor taps the existing 👎 button
3. `POST /messages/:id/feedback { value: "negative" }`
4. `ChatMediaService.setMessageFeedback` writes the existing DB row
5. **NEW**: fetches the original user message, recomputes the cache key, calls `cache.del(key)`
6. Logs `llm_cache_invalidated_by_feedback`
7. Next visitor asking the same question → Redis miss → fresh LLM call → new cached value

**Limitation** : the local frontend cache of already-connected visitors may serve the 👎'd response for up to 7 days. This is an acceptable trade-off for v1 (the majority of new visitors get the corrected version).

**Future enhancement (not v1)** : `GET /museums/:id/cache-invalidations?since=<timestamp>` for the frontend to pull invalidated keys at app start.

### 6.5 — Bonus scenario: KnowledgeBase Redis upgrade

1. `KnowledgeBaseService.lookupFacts("la joconde", "fr")` called inside the LLM flow
2. `cache.get("kb:wikidata:fr:la_joconde")` → Redis hit (another instance fetched it earlier)
3. Returns facts immediately, skips Wikidata API
4. **~5ms vs ~300ms Wikidata roundtrip**

Gain : all backend instances share the KB cache. Before, each instance had its own in-memory `Map`.

---

## 7. Error Handling & Security

### 7.1 — Fail-open principle

The Smart Low-Data Mode is an **optimization**, never a point of failure. All cache errors degrade silently to current behaviour (direct LLM call).

| Component | Error type | Behaviour |
|-----------|-----------|-----------|
| `cache.get()` | Redis down, parse fail | Return `null` → cache miss → LLM call |
| `cache.set()` | Redis down | Try/catch silent, log warn, continue |
| `cache.zadd()` | Redis down | Silent, popularity not tracked for that hit |
| `cache.del()` (feedback) | Redis down | Log warn, 👎 still persisted in DB, cache expires via TTL |
| `chatLocalCache.lookup()` (frontend) | AsyncStorage corruption | Return null, store reset in memory |
| `useMuseumPrefetch` | Endpoint 5xx or timeout | No pre-fetch for that museum, retry on next mount |
| `LowDataPackService` | Redis ZSET empty/corrupt | Return `entries: []`, seeded still returned from DB |

### 7.2 — Privacy gates

**`shouldCache` rejects when** :

1. `userMemoryBlock` is non-empty (personalized response → not cacheable)
2. `piiSanitizer.containsPii(input.text)` returns true (PII in question → skip)
3. `image` present (unique per photo)
4. `history.length > 0` (conversation context makes it user-specific)

**Consequence** : users with `memoryEnabled=true` (existing privacy toggle) do not benefit from the cache. Their experience is unchanged. Users with `memoryEnabled=false` (or no profile) get the cache.

### 7.3 — Security

| Risk | Mitigation |
|------|------------|
| PII leak via question | `piiSanitizer.containsPii` pre-check (existing component) |
| User context leak | Cache key excludes `userMemoryBlock` |
| Cache poisoning | Existing input/output guardrails run BEFORE caching |
| Rate limit bypass | Rate limit applies BEFORE cache lookup at HTTP layer |
| Cache enumeration | Pre-fetch endpoint returns max 30 entries, all guardrail-filtered |

**CORS** : `X-Data-Mode` header added to `Access-Control-Allow-Headers`.

**Admin purge endpoint** : `requireRole('admin')` + JWT auth + audit log + rate limit (10/min/admin).

### 7.4 — Edge cases

| Case | Handling |
|------|----------|
| **Cache stampede** (100 visitors, same question, empty cache) | Ignored v1 — rare in practice. Future: `setNx` lock if needed. |
| **Hash collision** (sha256 → 16 chars) | `originalText` stored alongside cached value, verified on hit. ~1 collision per 4 billion. |
| **Missing museumId** | `extractMuseumId` returns null → `shouldCache` returns false → no cache |
| **Streaming + cache hit** | Replay cached chunks at 25ms intervals to preserve UX |
| **AsyncStorage fail** | Try/catch silent, in-memory fallback |
| **NetInfo unreliable** | If `isConnected === null`, assume `normal` (optimistic) |
| **Hash divergence backend↔frontend** | Dedicated parity test in CI (gate to merge) |

### 7.5 — Observability

Structured log events to emit (existing logger via Sentry/OTel):

| Event | Fields | Level |
|-------|--------|-------|
| `llm_cache_hit` | `museumId`, `key`, `latencyMs` | info |
| `llm_cache_miss` | `museumId`, `key`, `reason` | info |
| `llm_cache_skip` | `reason` (image/history/pii/no-museum) | debug |
| `llm_cache_set` | `museumId`, `key`, `ttlSeconds` | info |
| `llm_cache_invalidated_by_feedback` | `museumId`, `key`, `userId` | warn |
| `llm_cache_admin_purged` | `museumId`, `deletedCount`, `adminId` | warn |
| `low_data_pack_served` | `museumId`, `entryCount`, `cachedCount`, `seededCount` | info |
| `low_data_mode_active` (frontend) | `preference`, `resolved`, `reason` | info |
| `local_cache_hit` (frontend) | `museumId` | info |

**Privacy** : we log `museumId` and the hash, never the original text or `userId` in public events.

**Target metrics (1 month after launch)** :
- Cache hit rate per museum > 40%
- LLM calls saved > 25%
- Cache hit latency < 100ms

### 7.6 — Rollback strategy

| Level | Action |
|-------|--------|
| 0 (immediate) | `CACHE_ENABLED=false` → `CachingChatOrchestrator` not instantiated, current flow restored |
| 1 (frontend) | Force `dataMode preference='normal'` via remote feature flag (out of scope v1) |
| 2 (DB) | `pnpm migration:revert` drops `museum_qa_seed` table |
| 3 (purge) | `redis-cli FLUSHDB` or per-museum admin purge route |

---

## 8. Testing Strategy

### 8.1 — Backend tests

| Test file | Type | Tests | LoC |
|-----------|------|-------|-----|
| `tests/unit/chat/caching-chat-orchestrator.test.ts` | unit | ~25 | ~400 |
| `tests/contract/cache-key-parity.test.ts` | contract | 15 vectors | ~80 |
| `tests/unit/museum/low-data-pack-service.test.ts` | unit | ~10 | ~150 |
| `tests/integration/chat/feedback-cache-invalidation.test.ts` | integration | ~8 | ~200 |
| `tests/unit/cache/redis-cache.service.test.ts` (extended) | unit | +6 | +100 |
| `tests/unit/chat/knowledge-base-service.test.ts` (adapted) | unit | ~10 | ~150 |
| `tests/integration/museum/low-data-pack.route.test.ts` | integration | ~5 | ~120 |
| `tests/integration/admin/cache-purge.route.test.ts` | integration | ~6 | ~130 |
| **Total backend** | | **~85 tests** | **~1330 LoC** |

**New shared factory** : `tests/helpers/chat/cacheService.fixtures.ts` (`makeMockCache()`).

### 8.2 — Frontend tests

| Test file | Type | Tests | LoC |
|-----------|------|-------|-----|
| `__tests__/chat/chatLocalCache.test.ts` | unit | ~12 | ~200 |
| `__tests__/chat/cacheKeyParity.test.ts` | contract | 15 vectors | ~80 |
| `__tests__/chat/DataModeProvider.test.tsx` | hook | ~10 | ~180 |
| `__tests__/chat/useChatSession.test.ts` (extended) | hook | +8 | +250 |
| `__tests__/museum/useMuseumPrefetch.test.tsx` | hook | ~8 | ~150 |
| `__tests__/settings/DataModeSettingsSection.test.tsx` | render | ~5 | ~80 |
| `__tests__/chat/ChatMessageBubble.test.tsx` (extended) | render | +3 | +50 |
| **Total frontend** | | **~50 tests** | **~990 LoC** |

### 8.3 — Hash parity (CI gate)

A shared fixture file (`tests/fixtures/cache-key-vectors.json`) contains 15 input/expected-key pairs. Both backend and frontend tests consume it. Both must agree on the output. **Mandatory CI gate to merge**.

### 8.4 — E2E (Maestro)

Manual smoke test only for v1: settings toggle → museum select → chat input → verify cached badge appears. Automated E2E requires backend seeding outside CI scope.

### 8.5 — Quality gates

- Backend tsc: 0 errors
- Frontend tsc: 0 errors
- Backend tests: 2331 → 2416 (no regression)
- Frontend tests: 1052 → 1102 (no regression)
- Coverage: maintain 93.62% backend statements
- ESLint disables: 0 new outside allowlist
- Hash parity test: PASS (CI gate)

---

## 9. Implementation Volume Summary

| | New files | Modified files | LoC code | LoC tests |
|---|-----------|----------------|----------|-----------|
| Backend | 9 | 12 | ~640 | ~1330 |
| Frontend | 7 | 8 | ~640 | ~990 |
| **Total** | **16** | **20** | **~1280** | **~2320** |

**Test/code ratio** : ~1.8 (acceptable; project average ~1.5).

---

## 10. Out of Scope (v1)

The following are explicitly **not** part of this implementation and are deferred:

1. Manual seed data for `museum_qa_seed` (added later via SQL/admin tooling)
2. Frontend cache invalidation propagation (`GET /museums/:id/cache-invalidations`)
3. Semantic/fuzzy cache matching (only exact hash for v1)
4. Cache stampede mitigation via `setNx` lock
5. Remote feature flag for emergency frontend rollback
6. Automated Maestro E2E (manual smoke test only)
7. Latency probes / active network quality measurement
8. Adaptive image compression based on data mode
9. Streaming token batching tuning based on data mode
10. Wildcard admin purge (`/admin/museums/*/cache/purge`)

These can be addressed in v2 iterations based on real-world metrics.

---

## 11. Definition of Done

- [ ] All 16 new files created and committed
- [ ] All 20 modified files updated
- [ ] All ~135 new tests passing
- [ ] Hash parity test passing in CI
- [ ] tsc: 0 errors backend + frontend
- [ ] ESLint: 0 new disables outside allowlist
- [ ] Coverage maintained at 93.62% backend statements
- [ ] OpenAPI spec regenerated and contract test passing
- [ ] `pnpm migration:run` succeeds on clean DB
- [ ] Migration reversible (`pnpm migration:revert` works)
- [ ] All 7 i18n locales updated for new keys
- [ ] Admin purge route audited (audit log entry visible)
- [ ] Manual smoke test in low-data mode (toggle → museum → cache hit) passes
- [ ] `CACHE_ENABLED=false` rollback verified (full pipeline still works)
- [ ] Sprint tracking updated (`PROGRESS_TRACKER.md` + `SPRINT_LOG.md`)
- [ ] Team report written to `team-reports/2026-04-XX-smart-low-data-mode.md`
