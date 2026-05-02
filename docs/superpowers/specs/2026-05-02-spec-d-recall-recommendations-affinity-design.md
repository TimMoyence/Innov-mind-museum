# Spec D — Recall + Recommendations + Cross-Session Affinity

**Date:** 2026-05-02
**Author:** Claude (under user direction)
**Status:** Approved (brainstorm signoff)
**Predecessor:** Spec C (`2026-05-02-spec-c-personalization-voice-design.md`)
**Builds on:** UserMemory personalization signals (favoritePeriods, languagePreference, sessionDurationP90Minutes), voice continuity.

## Goal

Ship the **recall + recommendation** half of Prompt 6:

1. **End-of-session recommendations** — when the VisitSummaryModal opens, surface 3 next-museum + 3 next-artwork suggestions blended from `MuseumRepository`, `ArtworkKnowledgeRepoPort`, and `UserMemory`.
2. **Multi-modal artwork recall** — when the user submits an image, look up similar artworks from their `notableArtworks` history (artist or period match via `ArtworkKnowledge`), weave a `[RECALL]` block into the LLM prompt.
3. **Cross-session artwork affinity** — track per-artwork follow-up message count; weight `notableArtworks` by affinity so recall + recs prioritize the artworks the user kept asking about.

All three compose through the additive `NotableArtwork.affinity` field — no migrations.

## Non-Goals

- LLM-synthesized recommendations (deferred to Spec E if static rec quality proves weak).
- Image embedding / vector similarity for recall (still no embeddings infra).
- ChatSession-level recommendation persistence (recs computed lazily per modal open).
- Web admin surface for affinity / recs (mobile only).
- BE cache layer for recs endpoint (data drift fast — relies on FE TanStack 5min staleTime).
- New locales (8 mobile locales scope only — `ar/de/en/es/fr/it/ja/zh`).

## Architecture

Three additive surfaces on the existing chat hexagonal module + one new thin module for recommendations.

```
museum-backend/src/modules/
├── chat/
│   ├── domain/
│   │   ├── userMemory.types.ts                    # NotableArtwork gains optional `affinity: number`
│   │   └── ports/recall.port.ts                   # NEW — RecallService interface
│   ├── useCase/
│   │   ├── visit-context.ts                       # extend computeSessionUpdates → tracks per-artwork follow-up count
│   │   ├── user-memory.service.ts                 # mergeArtworks bumps affinity (preserve max across sessions)
│   │   ├── recall.service.ts                      # NEW — buildBlock(detected, ownerId, locale)
│   │   └── enrichment-fetcher.ts                  # 2-stage: image first, then 5 fetchers + recall in parallel
│   └── adapters/
│       └── primary/http/...                       # OrchestratorInput.recallBlock plumbed through
├── knowledge-extraction/
│   ├── domain/ports/artwork-knowledge-repo.port.ts  # +findByPeriods(periods, locale, limit)
│   └── adapters/secondary/typeorm-artwork-knowledge.repo.ts
└── recommendations/                               # NEW MODULE
    ├── domain/recommendations.types.ts
    ├── useCase/recommendations.service.ts         # RecommendationsService.compute(sessionId, requesterId)
    ├── useCase/museum-ranker.ts                   # pure ranker
    ├── useCase/artwork-ranker.ts                  # pure ranker
    └── adapters/primary/http/recommendations.route.ts  # GET /api/chat/sessions/:sessionId/recommendations
```

Mobile FE:
```
museum-frontend/features/
├── chat/
│   └── application/useSessionRecommendations.ts   # NEW — TanStack useQuery
└── chat/ui/
    └── VisitSummaryModal.tsx                       # NEW "Recommended next" section
```

### Composition

- **Affinity (T3)** = pure write path — `mergeArtworks` increments per-artwork count from a new visit-context aggregator.
- **Recall (T2)** = pure read path on the user-message hot loop — fires only when `enrichedImages.length > 0` AND `ArtworkKnowledge.findByTitleAndLocale` returns artist or period.
- **Recs (T1)** = lazy-compute endpoint, cold path — called once per VisitSummaryModal mount.

Recall + recs both read `notableArtworks.affinity ?? 0`, so legacy rows degrade gracefully without backfill.

LLM prompt envelope: `[USER MEMORY] (≤600)` + new `[RECALL] (≤250)` = +250 char ceiling on enriched messages. Cache key already hashes the prompt — no manual invalidation needed.

## Components

### T3 — Affinity tracking

**`visit-context.ts` (modified)**
- `computeSessionUpdates` already aggregates `artworksDiscussed`. Add: walk newly-appended user messages, compare last entry's `(title, artist)` tuple against the previous entry's. Each consecutive same-tuple = +1 follow-up. Emit `artworksDiscussed[i].followUpCount: number`.
- New pure helper `tallyFollowUps(messages, currentArtworks): Map<key, number>` — testable in isolation.

**`userMemory.types.ts` (modified)**
```ts
export interface NotableArtwork {
  title: string;
  artist?: string;
  museum?: string;
  sessionId: string;
  discussedAt: string;
  affinity?: number;  // NEW — total follow-up count across sessions, default 0
}
```

**`user-memory-notable-artworks.schema.ts` (modified)**
- `NotableArtworkSchema` adds `affinity: z.number().int().nonnegative().optional()`.

**`user-memory.service.ts mergeArtworks` (modified)**
- For each new artwork from `visitContext.artworksDiscussed`:
  - `key = (title.toLowerCase(), artist?.toLowerCase() ?? '')`.
  - If existing notable matches key → bump `affinity = (existing.affinity ?? 0) + (new.followUpCount ?? 0)`, refresh `discussedAt + sessionId`.
  - Else → push new entry w/ `affinity = followUpCount ?? 0`.
- Cap MAX_ARTWORKS still 20, but eviction semantic changes: sort merged list by `affinity desc, discussedAt desc` then `slice(0, 20)` (keep top), replacing the existing `slice(-20)` (keep most recent). Intentional break — high-affinity entries now survive eviction even when newer low-affinity entries arrive. Tests document the new semantic explicitly.

### T2 — Recall block

**`ports/recall.port.ts`** (new interface)
```ts
export interface RecallMatch {
  title: string;
  artist?: string;
  matchReason: 'artist' | 'period';
}
export interface RecallService {
  buildBlock(args: { detectedTitle: string; ownerId: number; locale: string }): Promise<string>;
}
```

**`recall.service.ts`** (new)
- Inject `ArtworkKnowledgeRepoPort`, `UserMemoryRepository`.
- `buildBlock`:
  1. `findByTitleAndLocale(detectedTitle, locale)` → `{artist, period}` (fail-open: empty → '').
  2. Read `userMemory.notableArtworks` (skip if empty or `disabledByUser`).
  3. Filter notable candidates: keep when `notable.artist?.toLowerCase() === detected.artist?.toLowerCase()` (artist match — no extra DB hit) OR — for the first 5 unmatched candidates only — `findByTitleAndLocale(notable.title, locale).period === detected.period` (period match, costs 1 AK lookup per candidate, hard-capped at 5 to bound DB load).
  4. Top-3 by `affinity desc, discussedAt desc`.
  5. Render: `'[RECALL]\nUser previously discussed: <Title1> (<Artist1>); <Title2> (<Artist2>); ...\nUse these to draw connections, do not repeat facts already covered.'`. Cap 250 via `slice(0, 250)`. Sanitize titles + artists w/ `sanitizePromptInput(s, 50)`.
- Returns `''` on any failure path.

**`enrichment-fetcher.ts` (modified)**
- 2-stage refactor: `fetchImages` runs alone first (returns `EnrichedImage[]`); then `fetchMemory + fetchKnowledgeBase + fetchKbFacts + fetchWebSearchRaw + fetchLocalKnowledge + fetchRecall(detectedTitle from images)` run in parallel.
- New `fetchRecall(deps, enrichedImages, ownerId, locale)` — picks the top-scored image's title; only fires when `enrichedImages.length > 0` AND `ownerId` present.
- Add `recallBlock: string` to return shape.
- `OrchestratorInput.recallBlock?: string` — plumbed through `prepare-message.pipeline.ts buildOrchestratorInput`.

**LLM prompt builder** — render the recall block right after `[USER MEMORY]`, before `[LOCAL KNOWLEDGE]` (matches existing `localKnowledgeBlock` / `webSearchBlock` injection pattern).

### T1 — Recommendations

**`recommendations.types.ts`** (new)
```ts
export type MuseumReasonKey =
  | 'recs.reason.unvisited_period'
  | 'recs.reason.unvisited_artist'
  | 'recs.reason.popular';

export type ArtworkReasonKey =
  | 'recs.reason.high_affinity'
  | 'recs.reason.matches_period';

export interface RecommendedMuseum {
  id: number;
  name: string;
  slug: string;
  reasonKey: MuseumReasonKey;
  reasonValue?: string;  // e.g. period name or artist name for interpolation
}
export interface RecommendedArtwork {
  title: string;
  artist?: string;
  museum?: string;
  reasonKey: ArtworkReasonKey;
  reasonValue?: string;
}
export interface SessionRecommendations {
  museums: RecommendedMuseum[];
  artworks: RecommendedArtwork[];
}
```

**`museum-ranker.ts`** (pure)
- `rankMuseums(museums, userMemory): RecommendedMuseum[]` — score = period overlap (`Museum.config.periods` if present) + artist overlap (`Museum.config.featuredArtists` if present) − exclude lowercase-name in `museumsVisited`. Tiebreaker: name asc. Top-3.
- `Museum.config` is `Record<string, unknown>` — narrow via `MuseumConfigSchema` keys w/ runtime check; absent → score by `museumType` match against `userMemory.interests` only (`reasonKey: 'recs.reason.popular'`).

**`artwork-ranker.ts`** (pure)
- `rankArtworks(notableArtworks, periodMatches): RecommendedArtwork[]` — first 3 from notable sorted `affinity desc, discussedAt desc` (`reasonKey: 'recs.reason.high_affinity'`); pad up to 3 from `periodMatches` (unvisited artworks from `findByPeriods`, `reasonKey: 'recs.reason.matches_period'`). Dedupe `(title.toLowerCase(), artist?.toLowerCase())` between the two sources.

**`recommendations.service.ts`** (new)
- `compute(sessionId, requesterId): Promise<SessionRecommendations>`
  1. `ChatRepository.getSessionById(sessionId)` → `null` → `notFound`; `session.user?.id !== requesterId` → `forbidden`.
  2. `UserMemoryRepository.getByUserId(userId)` → `null` OR `disabledByUser` → `{museums: [], artworks: []}`.
  3. Parallel: `museumRepo.findAll({activeOnly: true})` + `artworkKnowledgeRepo.findByPeriods(memory.favoritePeriods, sessionLocale, 6)`.
  4. Run rankers, return.

**`recommendations.route.ts`** (new)
- `GET /api/chat/sessions/:sessionId/recommendations` — `requireAuth` middleware, calls `recommendationsService.compute(sessionId, req.user!.id)`.
- 200 on success, 403 if not owner, 404 if session missing.
- Rate-limited via existing `chatRateLimitMiddleware` (already mounted on `/api/chat/*`).

**`ArtworkKnowledgeRepoPort`** — add `findByPeriods(periods: string[], locale: string, limit: number): Promise<ArtworkKnowledge[]>`. Impl: `WHERE period = ANY(:periods) AND locale = :locale ORDER BY updatedAt DESC LIMIT :limit`.

### FE — VisitSummaryModal section

**`useSessionRecommendations.ts`** (new)
- TanStack `useQuery({queryKey: ['session', sessionId, 'recommendations'], queryFn, enabled: !!sessionId, staleTime: 5*60_000})`.
- Calls `chatService.getRecommendations(sessionId)` → returns `SessionRecommendations` typed from regenerated `openapi.ts`.

**`VisitSummaryModal.tsx`** (modified)
- New section after Stats, before close button: 'Recommended next' header → 2 sub-rows (museums, artworks). Each item: tappable card.
  - Museum tap → `router.push('/(stack)/museum/[id]')`.
  - Artwork tap → no-op v1 (display only). Future: artwork detail screen.
- States: loading (3 skeleton rows), empty (single line `t('recs.empty')`), error (single line `t('recs.error')`).
- Reason rendered via `t(item.reasonKey, { value: item.reasonValue })`.

**i18n keys (8 locales: ar/de/en/es/fr/it/ja/zh)**
```
recs.title
recs.museums
recs.artworks
recs.empty
recs.loading
recs.error
recs.museum.cta
recs.reason.unvisited_period
recs.reason.unvisited_artist
recs.reason.popular
recs.reason.high_affinity
recs.reason.matches_period
```

## Data Flow

### T3 — Affinity write path (every assistant commit)

```
User msg N+1 lands
  → ChatMessageService.postMessage
    → PrepareMessagePipeline.prepare (persists user msg)
      → assistant LLM round-trip
        → commitAssistantResponse
          → buildCommitPayload
            → computeSessionUpdates(session, assistantMetadata)
              ├─ existing: derive artworksDiscussed from new detectedArtwork
              └─ NEW: tallyFollowUps(history+new, artworksDiscussed)
                       → walk msgs DESC, count consecutive same-(title,artist)
                       → write followUpCount onto each artworksDiscussed[i]
          → persistMessage (assistant) w/ sessionUpdates
            → ChatSession.visitContext.artworksDiscussed[].followUpCount persisted
          → postCommitSideEffects
            → userMemory.updateAfterSession (fire-and-forget)
              → mergeArtworks
                ├─ key = (title.toLowerCase(), artist?.toLowerCase() ?? '')
                ├─ matched: bump affinity += followUpCount, refresh discussedAt+sessionId
                ├─ unmatched: push w/ affinity = followUpCount
                └─ sort affinity desc, discussedAt desc, slice top 20
              → repository.upsert (notableArtworks JSONB write)
              → invalidateCache (memory:prompt:<userId>)
```

### T2 — Recall read path (every user message w/ image)

```
User msg w/ image lands
  → PrepareMessagePipeline.prepare
    → processInputImage (existing)
    → enrichAndResolveLocation
      → fetchEnrichmentData
        Stage 1: fetchImages → enrichedImages[]
        Stage 2 (parallel via Promise.all):
        ├─ fetchMemory
        ├─ fetchKnowledgeBase
        ├─ fetchKbFacts
        ├─ fetchWebSearchRaw
        ├─ fetchLocalKnowledge
        └─ NEW: fetchRecall(deps, enrichedImages, ownerId, locale)
                  ├─ if ownerId+enrichedImages.length>0: pick top-scored image title
                  ├─ recallService.buildBlock({detectedTitle, ownerId, locale})
                  │    ├─ ArtworkKnowledge.findByTitleAndLocale → {artist, period}
                  │    ├─ UserMemory.getByUserId → notableArtworks[]
                  │    ├─ filter notable WHERE artist match OR (lookup notable.title → its period match)
                  │    │   (cap secondary lookups to 5 candidates to bound DB load)
                  │    ├─ sort affinity desc, discussedAt desc → top 3
                  │    └─ render block ≤250 chars, sanitize
                  └─ failOpen → '' on any throw
  → recallBlock plumbed into PrepareReady
  → buildOrchestratorInput → OrchestratorInput.recallBlock
  → llm-prompt-builder renders [RECALL] after [USER MEMORY], before [LOCAL KNOWLEDGE]
```

### T1 — Recommendations cold path (modal open)

```
FE VisitSummaryModal opens (visible=true)
  → useSessionRecommendations.useQuery (enabled=visible)
    → chatService.getRecommendations(sessionId)
      → GET /api/chat/sessions/:sessionId/recommendations  [auth: Bearer]
        → recommendations.route handler
          → recommendationsService.compute(sessionId, req.user.id)
            ├─ chatRepo.getSessionById(sessionId)
            │   ├─ null → 404
            │   └─ session.user.id !== requesterId → 403
            ├─ userMemory.getByUserId(userId)
            │   └─ null OR disabledByUser → return {museums:[], artworks:[]}
            ├─ Promise.all
            │   ├─ museumRepo.findAll({activeOnly: true})
            │   └─ artworkKnowledgeRepo.findByPeriods(memory.favoritePeriods, sessionLocale, 6)
            ├─ museumRanker.rank(museums, memory) → top 3 RecommendedMuseum[]
            └─ artworkRanker.rank(memory.notableArtworks, periodMatches) → top 3 RecommendedArtwork[]
        → 200 { museums: [...], artworks: [...] }
    → cached @ TanStack staleTime 5min
  → render section
```

### Cross-cutting

- **Cache:** BE has no recs cache (data drift fast). FE TanStack cache 5min sufficient for "modal close+reopen w/o stale lookup".
- **Locale:** recs return localized `reasonKey` only — FE renders. Period names from ArtworkKnowledge are already locale-scoped.
- **GDPR:** `disabledByUser` flag honored at recs path AND recall path AND existing user-memory prompt path.

## Error Handling

### T3 — Affinity (write path, fail-silent)

| Failure | Behavior | Rationale |
|---|---|---|
| `tallyFollowUps` throws (malformed history) | log `affinity_tally_failed`, omit `followUpCount`, persist sessionUpdates as-is | preserves chat flow; affinity is enhancement |
| `mergeArtworks` JSONB validation fails | logged via existing `jsonbValidator` | should not happen — affinity is `optional`, additive |
| Concurrent merge race (two messages closed within ms) | last writer wins (matches existing UserMemory `INSERT ON CONFLICT UPDATE` semantics) | acceptable; converges next message |
| MAX_ARTWORKS eviction drops a high-affinity artwork that re-enters | new entry gets `affinity = 0` then bumps; sort `affinity desc` first → high-affinity entries survive eviction | by design |

Logged via existing `logger.warn('user_memory_update_failed', ...)` swallow at `postCommitSideEffects`.

### T2 — Recall (read path, fail-open)

| Failure | Behavior |
|---|---|
| `findByTitleAndLocale` throws / returns null | `buildBlock → ''` |
| Returned row w/o artist AND period | `buildBlock → ''` |
| Secondary period lookups (capped 5) any throw | per-candidate try/catch, partial matches still rendered |
| `UserMemory.getByUserId` throws | `failOpen` wrapper at `enrichment-fetcher` → `recallBlock = ''` |
| `disabledByUser === true` | `buildBlock → ''` (early exit before any DB hit) |
| `notableArtworks` empty | `buildBlock → ''` (early exit, no DB hit) |
| Render exceeds 250 chars | `slice(0, 250)` hard cap |

All recall failures invisible to user. Logged at WARN w/ structured fields `{userId, sessionId, detectedTitle, error}`.

### T1 — Recommendations (cold endpoint)

| Failure | HTTP | Body |
|---|---|---|
| Session not found | 404 | `{error: 'session_not_found'}` |
| Session not owned by requester | 403 | `{error: 'forbidden'}` |
| `userMemory.disabledByUser` OR no memory yet | 200 | `{museums: [], artworks: []}` |
| `MuseumRepository.findAll` throws | 500 → app error handler | logged |
| `ArtworkKnowledge.findByPeriods` throws | partial fallback — museums returned, artworks `[]` | one source down ≠ all-or-nothing |
| `Museum.config` schema validation fails | per-museum `try/catch`, skip museum, continue ranking | matches existing `jsonbValidator` |
| Auth missing | 401 via existing `requireAuth` | standard |

FE error handling:

| Path | Behavior |
|---|---|
| `useQuery` retry | TanStack default retries; for 4xx, no retry |
| 403/404 | render `t('recs.error')` line, no toast |
| Network down | render `t('recs.error')`, retry on next modal open |
| Loading >2s | skeleton stays visible (no spinner, no timeout) |
| Modal closed mid-fetch | TanStack cancels via `enabled` toggle on next render |

### Security

- Recall block: detected titles + notable artwork titles all sanitized via `sanitizePromptInput` before LLM injection. Period strings from ArtworkKnowledge are admin-curated rows (trusted).
- Recs endpoint: ownership check via `session.user.id` — cannot enumerate other users' recs.
- Affinity: integer w/ `nonnegative` Zod constraint blocks JSONB shape injection.

## Testing

Test pyramid follows ADR-012 — integration files only when they import `tests/helpers/e2e/postgres-testcontainer.ts` or instantiate a real TypeORM `DataSource`.

### T3 — Affinity (BE)

**Unit (`tests/unit/chat/`)**
- `tally-follow-ups.test.ts` (NEW) — 8 cases: empty history; single artwork single message → `followUpCount=0`; same artwork 3 consecutive → `followUpCount=2`; A→B→A→B alternation → no follow-ups; artist undefined; mid-session museum switch; history exceeds maxHistoryMessages; malformed metadata.
- `user-memory-merge-artworks-affinity.test.ts` (NEW) — 6 cases: new artwork w/ followUpCount=2 → affinity=2; existing.affinity=3 + new.followUpCount=2 → 5; case-insensitive matching; eviction sorts by affinity desc; legacy entries default to 0; tied affinity → discussedAt desc.
- `user-memory-prompt.test.ts` (extend) — verify affinity NOT rendered in `[USER MEMORY]` block.
- `notable-artworks-schema.test.ts` (extend) — affinity optional, nonnegative integer, rejects negative + float.

**Integration (`tests/integration/chat/`)**
- `user-memory-affinity.integration.test.ts` (NEW, postgres-testcontainer) — 3 cases: 5-msg session w/ 3 follow-ups → affinity=2 persisted; cross-session bump; eviction holds top affinity across 25 distinct artworks.

### T2 — Recall (BE)

**Unit (`tests/unit/chat/`)**
- `recall.service.test.ts` (NEW) — 12 cases: empty notable → ''; disabledByUser → ''; findByTitleAndLocale null → ''; row w/o artist+period → ''; artist match only; period match only; both match top 3 by affinity; 5 matches; tied affinity → discussedAt; sanitize zero-width chars; render ≤250 chars; truncated mid-entry on cap.
- `enrichment-fetcher-recall.test.ts` (NEW) — 4 cases: 2-stage order; no enrichedImages → recall skipped; recall throw → failOpen → ''; top-scored image used.
- `prepare-message-pipeline-recall.test.ts` (extend existing) — recallBlock plumbed into PrepareReady + OrchestratorInput.
- `llm-prompt-builder.test.ts` (extend) — `[RECALL]` rendered after `[USER MEMORY]`, before `[LOCAL KNOWLEDGE]`.

**Integration (`tests/integration/chat/`)**
- `recall-pipeline.integration.test.ts` (NEW) — 1 case: image upload → real ArtworkKnowledge lookup → real UserMemory read → assert recall block in OrchestratorInput captured via stub orchestrator.

### T1 — Recommendations (BE)

**Unit (`tests/unit/recommendations/`)**
- `museum-ranker.test.ts` (NEW) — 8 cases: empty museums; all visited; period overlap scoring; artist overlap scoring; tied → name asc; museum.config absent → museumType↔interests fallback; museum.config schema invalid → skipped; top 3 only.
- `artwork-ranker.test.ts` (NEW) — 6 cases: empty + empty → []; 5 notable → top 3; notable empty + 3 period matches; 1 notable + 4 padding → 3; dedupe (title+artist); tied affinity → discussedAt.
- `recommendations.service.test.ts` (NEW) — 7 cases: session not found → notFound; wrong owner → forbidden; empty userMemory → {[],[]}; disabledByUser → {[],[]}; happy path 3+3; museumRepo throws → bubbles; artworkKnowledge throws → museums returned, artworks=[].
- `artwork-knowledge-find-by-periods.test.ts` (NEW) — 4 cases on the new repo method (in-memory shim): empty periods, single, multiple, limit honored.

**Route (`tests/unit/recommendations/http/`)**
- `recommendations.route.test.ts` (NEW) — 5 cases via supertest: 401 no auth; 403 wrong owner; 404 missing session; 200 happy path w/ contract shape match; 200 empty memory shape.

**Integration (`tests/integration/recommendations/`)**
- `recommendations-endpoint.integration.test.ts` (NEW, postgres-testcontainer) — 1 case: full GET round trip w/ seeded museum + artwork knowledge + user memory rows.

### FE — Recommendations section

**Unit (`__tests__/features/chat/`)**
- `useSessionRecommendations.test.ts` (NEW) — 5 cases via `QueryClientProvider` + RNTL: enabled=false → no fetch; 200 happy path; 4xx → no retry; 5xx → retry then error; cache hit on remount within staleTime.
- `VisitSummaryModal.test.tsx` (extend) — 6 cases: loading → 3 skeleton rows; empty → `recs.empty`; error → `recs.error`; 3 museums + 3 artworks rendered with reason text via `t()`; museum tap → `router.push('/(stack)/museum/<id>')`; artwork tap → no-op.

**i18n parity (`__tests__/i18n/`)**
- `recs-keys-parity.test.ts` (NEW) — assert all 12 `recs.*` keys exist across `ar/de/en/es/fr/it/ja/zh`.

### Contract / OpenAPI

- `tests/contract/openapi-recommendations.test.ts` (NEW) — pull `GET /api/chat/sessions/:sessionId/recommendations` operation from `openapi/openapi.json`, validate response shape against AJV schema.

### Acceptance criteria (verified at post-flight)

1. **Affinity persists**: send 3 follow-up user messages on same artwork → `user_memories.notableArtworks` JSONB → entry has `affinity ≥ 2`.
2. **Affinity composes**: second session w/ 1 follow-up on same artwork → row `affinity` increased by 1.
3. **Recall fires**: upload image → request payload (intercept stub orchestrator) → `recallBlock` non-empty when prior session discussed same-artist artwork.
4. **Recall fails closed**: same flow with empty userMemory → `recallBlock === ''`.
5. **Recs returned**: GET `/api/chat/sessions/:id/recommendations` for session w/ memory → `museums.length ≤ 3 && artworks.length ≤ 3`, `reasonKey` populated on every item.
6. **Recs ownership**: same GET with another user's bearer → 403.
7. **Recs empty**: same GET for `disabledByUser=true` user → `{museums: [], artworks: []}`.
8. **FE surface**: VisitSummaryModal opens → "Recommended next" section visible → tap museum card navigates to `/(stack)/museum/[id]`.
9. **i18n parity**: 8 mobile locales contain all 12 `recs.*` keys.
10. **No regression**: BE test count ≥ 3807 + new tests, FE test count ≥ baseline + new, all gates green (tsc + ESLint + as-any=0).

### Test counts estimate

- BE unit: ~57 new
- BE integration: ~3 new
- BE route: ~5 new
- BE contract: ~1 new
- FE unit: ~11 new
- FE i18n: ~1 new

**Total ≈ 78 new tests.**

## Out of scope (deferred to Spec E)

- Decay function for affinity (older follow-ups weighted less). v1 = simple cumulative count.
- LLM-synthesized recs (calls orchestrator with a "recommend" system prompt).
- Image embedding pipeline for true visual similarity recall.
- Web admin surface for inspecting per-user affinity / recs.
- ChatSession-level recommendation persistence (re-open same session, see same recs).
- Artwork detail screen w/ recommended-action surface.
