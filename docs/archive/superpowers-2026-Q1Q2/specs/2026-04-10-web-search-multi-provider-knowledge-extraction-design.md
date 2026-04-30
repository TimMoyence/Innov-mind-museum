# Web Search Multi-Provider + Knowledge Extraction Pipeline

**Date:** 2026-04-10
**Status:** Approved
**Scope:** Backend (museum-backend)
**Pipeline:** Enterprise (20+ files, cross-module, DB migrations, new module)

---

## Overview

Two interconnected features that create a self-improving knowledge loop:

1. **Multi-provider web search with sequential fallback** — 5 providers ordered by quality (Tavily > Google CSE > Brave > SearXNG > DuckDuckGo), fail-open
2. **Background knowledge extraction pipeline** — scrape URLs from search results, classify content via LLM (LangChain + gpt-4o-mini), store structured data in DB, serve it as priority enrichment in future chats

### The Virtuous Cycle

```
User chat → DB lookup (local knowledge) → hit? → rich response (no web search needed)
                                         → miss? → web search (fallback chain)
                                                      → response to user (snippets)
                                                      → fire-and-forget: enqueue URLs
                                                         → background: scrape → LLM classify → DB insert
                                                            → next chat on same topic → DB hit
```

---

## Feature A — Multi-Provider Web Search (Fallback Chain)

### Providers

| Priority | Provider | API Key | Free Tier | Method |
|----------|----------|---------|-----------|--------|
| 1 | Tavily | `TAVILY_API_KEY` | 1000 req/month | REST POST |
| 2 | Google Custom Search | `GOOGLE_CSE_API_KEY` + `GOOGLE_CSE_ID` | 100 req/day (~3000/month) | REST GET |
| 3 | Brave Search | `BRAVE_SEARCH_API_KEY` | 2000 req/month | REST GET |
| 4 | SearXNG | None | Unlimited (public instances) | REST GET JSON |
| 5 | DuckDuckGo | None | Unlimited | HTML scrape (no official JSON API) |

### Architecture

All providers implement the existing `WebSearchProvider` interface (zero changes to the port):

```
WebSearchProvider (existing port)
  ├── TavilyClient             (exists, unchanged)
  ├── GoogleCseClient           (new, ~50L)
  ├── BraveSearchClient         (new, ~50L)
  ├── SearxngClient             (new, ~50L, multi-instance pool like Overpass)
  ├── DuckDuckGoClient          (new, ~60L)
  └── FallbackSearchProvider    (new, ~40L — chains all configured providers)
```

### FallbackSearchProvider Behavior

- Iterates providers in priority order
- On success with results > 0: returns immediately (no further providers called)
- On empty results OR error: logs warning, moves to next provider
- Providers without configured API keys are automatically excluded from the chain
- All providers fail: returns `[]` (fail-open, unchanged contract)
- SearXNG uses instance pool with rotation (same pattern as Overpass mirrors)

### Environment Config

```env
# Optional — only providers with configured keys are active
TAVILY_API_KEY=tvly-xxx
GOOGLE_CSE_API_KEY=AIza-xxx
GOOGLE_CSE_ID=xxx
BRAVE_SEARCH_API_KEY=BSA-xxx
SEARXNG_INSTANCES=https://search.bus-hit.me,https://searx.be,https://search.ononoki.org
# DuckDuckGo: no key needed, always available as last resort
```

### Impact on Existing Code

- `WebSearchProvider` interface: **unchanged**
- `WebSearchService`: **unchanged** — receives `FallbackSearchProvider` instead of `TavilyClient`
- `web-search.port.ts`: add optional `name` field to provider for logging
- `chat/index.ts` `buildWebSearch()`: modified to build fallback chain instead of single TavilyClient
- `env.ts` / `env.types.ts`: new config fields for additional providers

**Zero breaking changes.** Downstream service is unaware of the fallback mechanism.

---

## Feature B — Knowledge Extraction Module

### Module Structure (Hexagonal)

```
src/modules/knowledge-extraction/
├── domain/
│   ├── extracted-content.entity.ts      # raw scraped content cache
│   ├── artwork-knowledge.entity.ts      # LLM-structured artwork data
│   ├── museum-enrichment.entity.ts      # LLM-structured museum data
│   └── ports/
│       ├── scraper.port.ts              # HTML scraping interface
│       ├── content-classifier.port.ts   # LLM classification interface
│       └── extraction-queue.port.ts     # job queue interface
├── useCase/
│   ├── extraction-job.service.ts        # orchestrates: scrape → classify → store
│   ├── content-classifier.service.ts    # LangChain gpt-4o-mini classification
│   └── db-lookup.service.ts             # local DB query (used by enrichment loop)
├── adapters/
│   ├── primary/
│   │   └── extraction.worker.ts         # BullMQ worker (consumes queue)
│   └── secondary/
│       ├── html-scraper.ts              # cheerio + @mozilla/readability
│       ├── typeorm-extracted-content.repo.ts
│       ├── typeorm-artwork-knowledge.repo.ts
│       └── typeorm-museum-enrichment.repo.ts
└── index.ts                             # module wiring
```

### Database Entities

#### `extracted_content` — raw scraping cache

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `url` | varchar UNIQUE | source URL |
| `title` | varchar | page title |
| `textContent` | text | extracted text (readability) |
| `scrapedAt` | timestamp | scrape date |
| `contentHash` | varchar | content hash (detect changes) |
| `status` | enum | `scraped`, `classified`, `failed`, `low_confidence` |

#### `artwork_knowledge` — LLM-extracted artwork data

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `title` | varchar | artwork name |
| `artist` | varchar nullable | artist |
| `period` | varchar nullable | period/movement |
| `technique` | varchar nullable | technique/materials |
| `description` | text | detailed description |
| `historicalContext` | text nullable | historical context |
| `dimensions` | varchar nullable | physical dimensions |
| `currentLocation` | varchar nullable | museum + room |
| `sourceUrls` | jsonb | URLs data was extracted from |
| `confidence` | float | LLM confidence score (0-1) |
| `needsReview` | boolean | true if confidence between 0.4-0.7 |
| `locale` | varchar | content language |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

Unique index on `(title, artist, locale)`.

#### `museum_enrichment` — LLM-extracted museum data

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `museumId` | uuid FK nullable | link to `museums` if matched |
| `name` | varchar | museum name |
| `openingHours` | jsonb nullable | structured hours |
| `admissionFees` | jsonb nullable | structured pricing |
| `website` | varchar nullable | official website |
| `collections` | jsonb nullable | main collections |
| `currentExhibitions` | jsonb nullable | temporary exhibitions |
| `accessibility` | jsonb nullable | accessibility info |
| `sourceUrls` | jsonb | source URLs |
| `confidence` | float | LLM confidence score |
| `needsReview` | boolean | true if confidence between 0.4-0.7 |
| `locale` | varchar | |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

Unique index on `(name, locale)`. FK to `museums.id` when matched.

Both `artwork_knowledge.title` and `museum_enrichment.name` get `pg_trgm` GIN indexes for fuzzy search via `ILIKE` / similarity.

### HTML Scraper

```
URL → fetch (timeout 5s, honest User-Agent)
    → @mozilla/readability (extract main content, strip nav/ads/footer)
    → cheerio (cleanup residual HTML → clean text)
    → { title, textContent, url }
```

- Respects `robots.txt` (basic check before scraping)
- Rate limit: max 1 req/second per domain
- Skips PDFs, images, videos (Content-Type check)
- Max 50KB extracted text per page (truncated beyond)

### Content Classifier (LangChain + gpt-4o-mini)

**All LLM calls go through LangChain. No exceptions.**

Uses a dedicated `LangChainExtractorClient` (not the chat orchestrator — that one handles streaming/history/sections). Simple `ChatOpenAI` with `withStructuredOutput(zodSchema)`.

#### System Prompt

```
You are a museum data extractor. You receive text from a web page.

1. Determine if the page discusses an ARTWORK, a MUSEUM, or is IRRELEVANT.
2. If artwork: extract title, artist, period, technique, description,
   historicalContext, dimensions, currentLocation.
3. If museum: extract name, openingHours, admissionFees, website,
   collections, currentExhibitions, accessibility.
4. If irrelevant: return type "irrelevant".
5. Score your confidence from 0.0 to 1.0.

Rules:
- NEVER invent data. If information is not in the text, return null.
- Prefer factual data over opinions.
- The description field must be informative, not promotional.
```

#### Structured Output (Zod)

Discriminated union: `{ type: "artwork" | "museum" | "irrelevant", confidence: number, data: ... }`

LangChain forces valid JSON output via function calling — no manual parsing.

#### Confidence Thresholds

| Score | Action |
|-------|--------|
| >= 0.7 | Auto INSERT/UPDATE in DB |
| >= 0.4 and < 0.7 | Store with `needs_review` flag |
| < 0.4 | Ignored, mark `low_confidence` in `extracted_content.status` |

#### Conflict Resolution (existing data)

- **New confidence > existing**: UPDATE with new data, append `sourceUrl`
- **New confidence <= existing**: append `sourceUrl` only, no data overwrite
- **Partial merge**: if existing has `dimensions: null` and new has `dimensions: "65x54cm"`, fill the gap regardless of score

#### Cost Estimate

- gpt-4o-mini: ~$0.15/1M input, ~$0.60/1M output tokens
- Average page: ~2000 tokens input, ~300 tokens output
- Per page: ~$0.0005
- 1000 pages/month: ~$0.50/month

---

## Enrichment Loop Integration

### Modified Chat Pipeline

`enrichment-fetcher.ts` gains a 6th parallel source:

```
fetchEnrichmentData() — 6 sources in parallel:
  ├── User Memory              (unchanged)
  ├── Knowledge Base           (Wikidata, unchanged)
  ├── KB Facts                 (unchanged)
  ├── Image Enrichment         (unchanged)
  ├── Web Search               (now multi-provider fallback)
  └── Local Knowledge DB       (NEW — artwork_knowledge + museum_enrichment)
```

### Prompt Priority Order

In `llm-prompt-builder.ts`, sections injected as SystemMessages:

```
1. [LOCAL KNOWLEDGE]     ← DB-extracted data (high confidence, verified)
2. [KNOWLEDGE BASE]      ← Wikidata (structured, reliable)
3. [WEB SEARCH]          ← web results (fresh but unverified)
4. [USER MEMORY]         ← user preferences
```

LLM instruction: *"Prioritize [LOCAL KNOWLEDGE] and [KNOWLEDGE BASE] data as they are verified. Use [WEB SEARCH] to supplement with recent information."*

### DB Lookup Service

- Searches `artwork_knowledge` and `museum_enrichment` by `ILIKE` + `pg_trgm` similarity on title/name
- Timeout: 500ms max (local DB, must be fast)
- Fail-open like all other enrichment sources
- Formats results into `[LOCAL KNOWLEDGE]` prompt block

### URL Enqueue After Web Search

After `WebSearchService.searchRaw()` returns results:

- Fire-and-forget: enqueue URLs to BullMQ extraction queue
- Never blocks the chat response
- Deduplicates: skips URLs already in `extracted_content` (unless stale > 7 days)

### BullMQ Worker — Job Lifecycle

```
Job received: { url, searchTerm, locale }
  ↓
1. Dedup: URL in extracted_content?
   → Yes + scrapedAt < 7 days → SKIP
   → Yes + scrapedAt >= 7 days → RE-SCRAPE
   → No → SCRAPE
  ↓
2. Scrape: fetch + readability + cheerio → textContent
  ↓
3. Classify: LangChain gpt-4o-mini → { type, data, confidence }
  ↓
4. Store:
   → extracted_content: INSERT/UPDATE raw content
   → artwork_knowledge: INSERT/UPDATE if type=artwork && confidence >= 0.4
   → museum_enrichment: INSERT/UPDATE if type=museum && confidence >= 0.4
  ↓
5. Log: extraction_success / extraction_skipped / extraction_failed
```

---

## Configuration

```env
# Feature flags
FEATURE_FLAG_WEB_SEARCH=true
FEATURE_FLAG_KNOWLEDGE_EXTRACTION=true

# Web search providers (optional — only configured ones are active)
TAVILY_API_KEY=tvly-xxx
GOOGLE_CSE_API_KEY=AIza-xxx
GOOGLE_CSE_ID=xxx
BRAVE_SEARCH_API_KEY=BSA-xxx
SEARXNG_INSTANCES=https://search.bus-hit.me,https://searx.be,https://search.ononoki.org

# Web search (existing)
WEB_SEARCH_TIMEOUT_MS=3000
WEB_SEARCH_CACHE_TTL_SECONDS=3600
WEB_SEARCH_MAX_RESULTS=5

# BullMQ extraction queue
EXTRACTION_QUEUE_CONCURRENCY=2
EXTRACTION_QUEUE_RATE_LIMIT=60

# Scraper
EXTRACTION_SCRAPE_TIMEOUT_MS=5000
EXTRACTION_CONTENT_MAX_BYTES=51200
EXTRACTION_REFETCH_AFTER_DAYS=7

# Classifier
EXTRACTION_LLM_MODEL=gpt-4o-mini
EXTRACTION_CONFIDENCE_THRESHOLD=0.7
EXTRACTION_REVIEW_THRESHOLD=0.4
```

---

## New Dependencies

| Package | Purpose | Size |
|---------|---------|------|
| `bullmq` | Redis-backed job queue | ~150KB |
| `@mozilla/readability` | Firefox Reader View content extraction | ~30KB |
| `cheerio` | HTML parsing → clean text | ~200KB |
| `robots-parser` | robots.txt compliance | ~10KB |

No new LangChain dependencies — `@langchain/openai` already in the project.

---

## Guardrails & Limits

| Limit | Value | Reason |
|-------|-------|--------|
| Scrape rate | 1 req/s per domain | Politeness, avoid bans |
| Queue concurrency | 2 jobs max | VPS resource protection |
| Content max | 50KB per page | Avoid massive pages |
| Re-scrape | after 7 days | Fresh content without spam |
| Confidence auto-insert | >= 0.7 | Data quality |
| LLM calls | rate limited via queue | Cost control |
| URLs per chat | max 5 (top results) | No excessive scraping |
| robots.txt | respected | Ethics + legal |

---

## Scope Estimate

| Component | Files | Lines (est.) |
|-----------|-------|--------------|
| 4 new search clients | 4 | ~200L |
| FallbackSearchProvider | 1 | ~40L |
| Search wiring modified | 1 (mod) | ~30L delta |
| knowledge-extraction module | ~12 | ~600L |
| Migrations (3 tables) | 3 | ~150L |
| Unit tests | ~8 | ~500L |
| Config env | 2 (mod) | ~40L delta |
| **Total** | **~31 files** | **~1560L** |

---

## Out of Scope (YAGNI)

- No admin UI for `needs_review` data moderation (future feature)
- No recursive scraping (no following internal page links)
- No vector embeddings / semantic search (trigram ILIKE sufficient for now)
- No multi-language classifier logic (LLM handles natively)
- No webhook/notification on extraction cycle completion
- No frontend citations UI (separate feature)

---

## DB Migrations

3 new tables generated via `node scripts/migration-cli.cjs generate`:

1. `CreateExtractedContent` — raw scraping cache
2. `CreateArtworkKnowledge` — structured artwork data
3. `CreateMuseumEnrichment` — structured museum data

Plus `pg_trgm` extension enable + GIN indexes on `artwork_knowledge.title` and `museum_enrichment.name`.
