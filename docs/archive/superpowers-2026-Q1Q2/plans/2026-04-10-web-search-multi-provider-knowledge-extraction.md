# Web Search Multi-Provider + Knowledge Extraction Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 5-provider sequential fallback web search and a background knowledge extraction pipeline that scrapes search result URLs, classifies content via LangChain gpt-4o-mini, stores structured museum/artwork data, and serves it as priority enrichment in future chats.

**Architecture:** Feature A extends the existing `WebSearchProvider` port with 4 new clients + a `FallbackSearchProvider` chain. Feature B adds a new hexagonal `knowledge-extraction` module with BullMQ worker, HTML scraper (cheerio + readability), LangChain classifier, and DB lookup integrated into the enrichment pipeline as a 6th parallel source.

**Tech Stack:** Node.js 22, TypeORM, BullMQ, @mozilla/readability, cheerio, robots-parser, LangChain (@langchain/openai), gpt-4o-mini, PostgreSQL pg_trgm

**Spec:** `docs/superpowers/specs/2026-04-10-web-search-multi-provider-knowledge-extraction-design.md`

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `src/modules/chat/adapters/secondary/google-cse.client.ts` | Google Custom Search API adapter |
| `src/modules/chat/adapters/secondary/brave-search.client.ts` | Brave Search API adapter |
| `src/modules/chat/adapters/secondary/searxng.client.ts` | SearXNG multi-instance adapter |
| `src/modules/chat/adapters/secondary/duckduckgo.client.ts` | DuckDuckGo HTML scrape adapter |
| `src/modules/chat/adapters/secondary/fallback-search.provider.ts` | Sequential fallback chain |
| `src/modules/knowledge-extraction/domain/extracted-content.entity.ts` | Raw scraped content entity |
| `src/modules/knowledge-extraction/domain/artwork-knowledge.entity.ts` | LLM-structured artwork data entity |
| `src/modules/knowledge-extraction/domain/museum-enrichment.entity.ts` | LLM-structured museum data entity |
| `src/modules/knowledge-extraction/domain/ports/scraper.port.ts` | HTML scraping interface |
| `src/modules/knowledge-extraction/domain/ports/content-classifier.port.ts` | LLM classification interface |
| `src/modules/knowledge-extraction/domain/ports/extraction-queue.port.ts` | Job queue interface |
| `src/modules/knowledge-extraction/useCase/db-lookup.service.ts` | Local DB query for enrichment |
| `src/modules/knowledge-extraction/useCase/db-lookup.prompt.ts` | Formats [LOCAL KNOWLEDGE] block |
| `src/modules/knowledge-extraction/useCase/content-classifier.service.ts` | LangChain gpt-4o-mini classifier |
| `src/modules/knowledge-extraction/useCase/extraction-job.service.ts` | Orchestrates scrape → classify → store |
| `src/modules/knowledge-extraction/adapters/secondary/html-scraper.ts` | cheerio + readability scraper |
| `src/modules/knowledge-extraction/adapters/secondary/typeorm-extracted-content.repo.ts` | TypeORM repo |
| `src/modules/knowledge-extraction/adapters/secondary/typeorm-artwork-knowledge.repo.ts` | TypeORM repo |
| `src/modules/knowledge-extraction/adapters/secondary/typeorm-museum-enrichment.repo.ts` | TypeORM repo |
| `src/modules/knowledge-extraction/adapters/primary/extraction.worker.ts` | BullMQ worker |
| `src/modules/knowledge-extraction/index.ts` | Module wiring |
| `tests/unit/chat/google-cse-client.test.ts` | Google CSE tests |
| `tests/unit/chat/brave-search-client.test.ts` | Brave Search tests |
| `tests/unit/chat/searxng-client.test.ts` | SearXNG tests |
| `tests/unit/chat/duckduckgo-client.test.ts` | DuckDuckGo tests |
| `tests/unit/chat/fallback-search-provider.test.ts` | Fallback chain tests |
| `tests/unit/knowledge-extraction/html-scraper.test.ts` | Scraper tests |
| `tests/unit/knowledge-extraction/content-classifier.test.ts` | Classifier tests |
| `tests/unit/knowledge-extraction/db-lookup.test.ts` | DB lookup tests |
| `tests/unit/knowledge-extraction/extraction-job.test.ts` | Extraction job tests |
| `tests/helpers/knowledge-extraction/extraction.fixtures.ts` | Test factories |

### Modified Files

| File | Change |
|------|--------|
| `src/modules/chat/domain/ports/web-search.port.ts` | Add optional `name` to provider |
| `src/modules/chat/index.ts` | Rebuild `buildWebSearch()` for fallback chain |
| `src/config/env.ts` | Add provider keys + extraction config |
| `src/config/env.types.ts` | Add provider + extraction types |
| `src/modules/chat/useCase/enrichment-fetcher.ts` | Add 6th source (local knowledge DB) + URL enqueue |
| `src/modules/chat/useCase/llm-prompt-builder.ts` | Add `localKnowledgeBlock` option |
| `src/modules/chat/useCase/chat-message.service.ts` | Wire localKnowledgeBlock + enqueue |
| `src/modules/chat/adapters/secondary/langchain.orchestrator.ts` | Pass localKnowledgeBlock |
| `src/data/db/data-source.ts` | Register 3 new entities |
| `package.json` | Add bullmq, cheerio, @mozilla/readability, robots-parser |

---

## Phase 1 — Multi-Provider Web Search Fallback

### Task 1: Google Custom Search Client

**Files:**
- Create: `src/modules/chat/adapters/secondary/google-cse.client.ts`
- Test: `tests/unit/chat/google-cse-client.test.ts`

- [x] **Step 1: Write the failing test**

```typescript
// tests/unit/chat/google-cse-client.test.ts
import { GoogleCseClient } from '@modules/chat/adapters/secondary/google-cse.client';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

describe('GoogleCseClient', () => {
  const client = new GoogleCseClient('fake-api-key', 'fake-cse-id');

  it('returns mapped results from a successful API response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            link: 'https://example.com/mona-lisa',
            title: 'Mona Lisa — Wikipedia',
            snippet: 'The Mona Lisa is a half-length portrait...',
          },
          {
            link: 'https://example.com/louvre',
            title: 'Louvre Museum',
            snippet: 'The Louvre is the world\'s largest art museum...',
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const results = await client.search({ query: 'Mona Lisa Louvre' });

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      url: 'https://example.com/mona-lisa',
      title: 'Mona Lisa — Wikipedia',
      snippet: 'The Mona Lisa is a half-length portrait...',
    });
  });

  it('returns empty array for empty query', async () => {
    const results = await client.search({ query: '   ' });
    expect(results).toEqual([]);
  });

  it('returns empty array on HTTP error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
    }) as unknown as typeof fetch;

    const results = await client.search({ query: 'test' });
    expect(results).toEqual([]);
  });

  it('returns empty array on network failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(
      new Error('Network error'),
    ) as unknown as typeof fetch;

    const results = await client.search({ query: 'test' });
    expect(results).toEqual([]);
  });

  it('returns empty array when items field is missing', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    const results = await client.search({ query: 'test' });
    expect(results).toEqual([]);
  });

  it('caps results at maxResults', async () => {
    const items = Array.from({ length: 15 }, (_, i) => ({
      link: `https://example.com/${i}`,
      title: `Result ${i}`,
      snippet: `Snippet ${i}`,
    }));

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items }),
    }) as unknown as typeof fetch;

    const results = await client.search({ query: 'test', maxResults: 3 });
    expect(results).toHaveLength(3);
  });

  it('passes abort signal to fetch', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    }) as unknown as typeof fetch;

    const controller = new AbortController();
    await client.search({ query: 'test', signal: controller.signal });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('customsearch'),
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd museum-backend && pnpm test -- --testPathPattern=tests/unit/chat/google-cse-client`
Expected: FAIL — module not found

- [x] **Step 3: Write the implementation**

```typescript
// src/modules/chat/adapters/secondary/google-cse.client.ts
import { logger } from '@shared/logger/logger';

import type {
  SearchResult,
  WebSearchProvider,
  WebSearchQuery,
} from '../../domain/ports/web-search.port';

const CSE_API_URL = 'https://www.googleapis.com/customsearch/v1';
const HARD_RESULT_LIMIT = 10;

interface GoogleCseItem {
  link: string;
  title: string;
  snippet: string;
}

interface GoogleCseResponse {
  items?: GoogleCseItem[];
}

/**
 * Google Custom Search Engine adapter implementing {@link WebSearchProvider}.
 *
 * Uses the JSON API (100 free queries/day). Never throws — returns empty
 * array on any error so the caller can fail-open.
 */
export class GoogleCseClient implements WebSearchProvider {
  readonly name = 'google-cse';

  constructor(
    private readonly apiKey: string,
    private readonly cseId: string,
  ) {}

  async search(query: WebSearchQuery): Promise<SearchResult[]> {
    if (!query.query.trim()) return [];

    const maxResults = Math.min(query.maxResults ?? 5, HARD_RESULT_LIMIT);

    const url = new URL(CSE_API_URL);
    url.searchParams.set('key', this.apiKey);
    url.searchParams.set('cx', this.cseId);
    url.searchParams.set('q', query.query);
    url.searchParams.set('num', String(maxResults));

    try {
      const response = await fetch(url.toString(), { signal: query.signal });

      if (!response.ok) {
        logger.warn('google_cse_http_error', {
          status: response.status,
          query: query.query,
        });
        return [];
      }

      const data = (await response.json()) as GoogleCseResponse;
      const items = data.items ?? [];

      return items.slice(0, maxResults).map((item) => ({
        url: item.link,
        title: item.title,
        snippet: item.snippet,
      }));
    } catch (err) {
      logger.warn('google_cse_exception', {
        error: err instanceof Error ? err.message : String(err),
        query: query.query,
      });
      return [];
    }
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd museum-backend && pnpm test -- --testPathPattern=tests/unit/chat/google-cse-client`
Expected: PASS (all 7 tests)

- [x] **Step 5: Commit**

```bash
cd museum-backend && git add src/modules/chat/adapters/secondary/google-cse.client.ts tests/unit/chat/google-cse-client.test.ts
git commit -m "feat(web-search): add Google Custom Search client with tests"
```

---

### Task 2: Brave Search Client

**Files:**
- Create: `src/modules/chat/adapters/secondary/brave-search.client.ts`
- Test: `tests/unit/chat/brave-search-client.test.ts`

- [x] **Step 1: Write the failing test**

```typescript
// tests/unit/chat/brave-search-client.test.ts
import { BraveSearchClient } from '@modules/chat/adapters/secondary/brave-search.client';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

describe('BraveSearchClient', () => {
  const client = new BraveSearchClient('fake-api-key');

  it('returns mapped results from a successful API response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        web: {
          results: [
            {
              url: 'https://example.com/venus',
              title: 'Venus de Milo',
              description: 'Ancient Greek sculpture...',
            },
          ],
        },
      }),
    }) as unknown as typeof fetch;

    const results = await client.search({ query: 'Venus de Milo' });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      url: 'https://example.com/venus',
      title: 'Venus de Milo',
      snippet: 'Ancient Greek sculpture...',
    });
  });

  it('returns empty array for empty query', async () => {
    const results = await client.search({ query: '' });
    expect(results).toEqual([]);
  });

  it('returns empty array on HTTP error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
    }) as unknown as typeof fetch;

    const results = await client.search({ query: 'test' });
    expect(results).toEqual([]);
  });

  it('returns empty array on network failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(
      new Error('fetch failed'),
    ) as unknown as typeof fetch;

    const results = await client.search({ query: 'test' });
    expect(results).toEqual([]);
  });

  it('handles missing web.results field', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ web: {} }),
    }) as unknown as typeof fetch;

    const results = await client.search({ query: 'test' });
    expect(results).toEqual([]);
  });

  it('sends X-Subscription-Token header', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ web: { results: [] } }),
    }) as unknown as typeof fetch;

    await client.search({ query: 'test' });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Subscription-Token': 'fake-api-key',
        }),
      }),
    );
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd museum-backend && pnpm test -- --testPathPattern=tests/unit/chat/brave-search-client`
Expected: FAIL — module not found

- [x] **Step 3: Write the implementation**

```typescript
// src/modules/chat/adapters/secondary/brave-search.client.ts
import { logger } from '@shared/logger/logger';

import type {
  SearchResult,
  WebSearchProvider,
  WebSearchQuery,
} from '../../domain/ports/web-search.port';

const BRAVE_API_URL = 'https://api.search.brave.com/res/v1/web/search';
const HARD_RESULT_LIMIT = 10;

interface BraveWebResult {
  url: string;
  title: string;
  description: string;
}

interface BraveApiResponse {
  web?: { results?: BraveWebResult[] };
}

/**
 * Brave Search API adapter implementing {@link WebSearchProvider}.
 *
 * Free tier: 2000 requests/month. Never throws — returns empty
 * array on any error so the caller can fail-open.
 */
export class BraveSearchClient implements WebSearchProvider {
  readonly name = 'brave';

  constructor(private readonly apiKey: string) {}

  async search(query: WebSearchQuery): Promise<SearchResult[]> {
    if (!query.query.trim()) return [];

    const maxResults = Math.min(query.maxResults ?? 5, HARD_RESULT_LIMIT);

    const url = new URL(BRAVE_API_URL);
    url.searchParams.set('q', query.query);
    url.searchParams.set('count', String(maxResults));

    try {
      const response = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': this.apiKey,
        },
        signal: query.signal,
      });

      if (!response.ok) {
        logger.warn('brave_search_http_error', {
          status: response.status,
          query: query.query,
        });
        return [];
      }

      const data = (await response.json()) as BraveApiResponse;
      const results = data.web?.results ?? [];

      return results.slice(0, maxResults).map((r) => ({
        url: r.url,
        title: r.title,
        snippet: r.description,
      }));
    } catch (err) {
      logger.warn('brave_search_exception', {
        error: err instanceof Error ? err.message : String(err),
        query: query.query,
      });
      return [];
    }
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd museum-backend && pnpm test -- --testPathPattern=tests/unit/chat/brave-search-client`
Expected: PASS (all 6 tests)

- [x] **Step 5: Commit**

```bash
cd museum-backend && git add src/modules/chat/adapters/secondary/brave-search.client.ts tests/unit/chat/brave-search-client.test.ts
git commit -m "feat(web-search): add Brave Search client with tests"
```

---

### Task 3: SearXNG Client

**Files:**
- Create: `src/modules/chat/adapters/secondary/searxng.client.ts`
- Test: `tests/unit/chat/searxng-client.test.ts`

- [x] **Step 1: Write the failing test**

```typescript
// tests/unit/chat/searxng-client.test.ts
import { SearxngClient } from '@modules/chat/adapters/secondary/searxng.client';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

describe('SearxngClient', () => {
  const instances = [
    'https://search.bus-hit.me',
    'https://searx.be',
    'https://search.ononoki.org',
  ];
  const client = new SearxngClient(instances);

  it('returns mapped results from first instance', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            url: 'https://example.com/starry-night',
            title: 'The Starry Night',
            content: 'Painting by Vincent van Gogh...',
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const results = await client.search({ query: 'Starry Night Van Gogh' });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      url: 'https://example.com/starry-night',
      title: 'The Starry Night',
      snippet: 'Painting by Vincent van Gogh...',
    });
  });

  it('falls back to next instance on failure', async () => {
    let callCount = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error('timeout'));
      return Promise.resolve({
        ok: true,
        json: async () => ({
          results: [{ url: 'https://b.com', title: 'B', content: 'b' }],
        }),
      });
    }) as unknown as typeof fetch;

    const results = await client.search({ query: 'test' });

    expect(results).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('returns empty array when all instances fail', async () => {
    global.fetch = jest.fn().mockRejectedValue(
      new Error('all down'),
    ) as unknown as typeof fetch;

    const results = await client.search({ query: 'test' });
    expect(results).toEqual([]);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('returns empty array for empty query', async () => {
    const results = await client.search({ query: '' });
    expect(results).toEqual([]);
  });

  it('rotates starting instance across calls', async () => {
    const urls: string[] = [];
    global.fetch = jest.fn().mockImplementation((url: string) => {
      urls.push(url);
      return Promise.resolve({
        ok: true,
        json: async () => ({ results: [{ url: 'https://x.com', title: 'X', content: 'x' }] }),
      });
    }) as unknown as typeof fetch;

    await client.search({ query: 'call1' });
    await client.search({ query: 'call2' });

    // Two different instances used as primary
    expect(urls[0]).not.toEqual(urls[1]);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd museum-backend && pnpm test -- --testPathPattern=tests/unit/chat/searxng-client`
Expected: FAIL — module not found

- [x] **Step 3: Write the implementation**

```typescript
// src/modules/chat/adapters/secondary/searxng.client.ts
import { logger } from '@shared/logger/logger';

import type {
  SearchResult,
  WebSearchProvider,
  WebSearchQuery,
} from '../../domain/ports/web-search.port';

const HARD_RESULT_LIMIT = 10;

interface SearxngResult {
  url: string;
  title: string;
  content: string;
}

interface SearxngResponse {
  results?: SearxngResult[];
}

/**
 * SearXNG meta-search adapter implementing {@link WebSearchProvider}.
 *
 * Rotates across a pool of public instances (like Overpass mirrors).
 * Falls back to next instance on failure. Free and unlimited.
 */
export class SearxngClient implements WebSearchProvider {
  readonly name = 'searxng';
  private nextIndex = 0;

  constructor(private readonly instances: string[]) {}

  async search(query: WebSearchQuery): Promise<SearchResult[]> {
    if (!query.query.trim() || this.instances.length === 0) return [];

    const maxResults = Math.min(query.maxResults ?? 5, HARD_RESULT_LIMIT);
    const startIndex = this.nextIndex;
    this.nextIndex = (this.nextIndex + 1) % this.instances.length;

    for (let i = 0; i < this.instances.length; i++) {
      const idx = (startIndex + i) % this.instances.length;
      const instance = this.instances[idx];

      try {
        const results = await this.fetchInstance(
          instance,
          query.query,
          maxResults,
          query.signal,
        );
        if (results.length > 0) return results;
      } catch (err) {
        logger.warn('searxng_instance_error', {
          instance,
          error: err instanceof Error ? err.message : String(err),
          query: query.query,
        });
      }
    }

    return [];
  }

  private async fetchInstance(
    baseUrl: string,
    queryStr: string,
    maxResults: number,
    signal?: AbortSignal,
  ): Promise<SearchResult[]> {
    const url = new URL('/search', baseUrl);
    url.searchParams.set('q', queryStr);
    url.searchParams.set('format', 'json');
    url.searchParams.set('categories', 'general');

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = (await response.json()) as SearxngResponse;
    const results = data.results ?? [];

    return results.slice(0, maxResults).map((r) => ({
      url: r.url,
      title: r.title,
      snippet: r.content,
    }));
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd museum-backend && pnpm test -- --testPathPattern=tests/unit/chat/searxng-client`
Expected: PASS (all 5 tests)

- [x] **Step 5: Commit**

```bash
cd museum-backend && git add src/modules/chat/adapters/secondary/searxng.client.ts tests/unit/chat/searxng-client.test.ts
git commit -m "feat(web-search): add SearXNG multi-instance client with tests"
```

---

### Task 4: DuckDuckGo Client

**Files:**
- Create: `src/modules/chat/adapters/secondary/duckduckgo.client.ts`
- Test: `tests/unit/chat/duckduckgo-client.test.ts`

- [x] **Step 1: Write the failing test**

```typescript
// tests/unit/chat/duckduckgo-client.test.ts
import { DuckDuckGoClient } from '@modules/chat/adapters/secondary/duckduckgo.client';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

describe('DuckDuckGoClient', () => {
  const client = new DuckDuckGoClient();

  it('returns mapped results from a successful response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        AbstractText: 'The Mona Lisa is a painting...',
        AbstractURL: 'https://en.wikipedia.org/wiki/Mona_Lisa',
        Heading: 'Mona Lisa',
        RelatedTopics: [
          {
            FirstURL: 'https://duckduckgo.com/Louvre',
            Text: 'Louvre — The museum where the Mona Lisa is displayed',
          },
          {
            FirstURL: 'https://duckduckgo.com/Leonardo_da_Vinci',
            Text: 'Leonardo da Vinci — Italian polymath and painter',
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const results = await client.search({ query: 'Mona Lisa' });

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]).toEqual({
      url: 'https://en.wikipedia.org/wiki/Mona_Lisa',
      title: 'Mona Lisa',
      snippet: 'The Mona Lisa is a painting...',
    });
  });

  it('returns empty array for empty query', async () => {
    const results = await client.search({ query: '   ' });
    expect(results).toEqual([]);
  });

  it('returns empty array on HTTP error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }) as unknown as typeof fetch;

    const results = await client.search({ query: 'test' });
    expect(results).toEqual([]);
  });

  it('returns empty array on network failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(
      new Error('Network error'),
    ) as unknown as typeof fetch;

    const results = await client.search({ query: 'test' });
    expect(results).toEqual([]);
  });

  it('handles response with no abstract or topics', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        AbstractText: '',
        AbstractURL: '',
        Heading: '',
        RelatedTopics: [],
      }),
    }) as unknown as typeof fetch;

    const results = await client.search({ query: 'test' });
    expect(results).toEqual([]);
  });

  it('caps results at maxResults', async () => {
    const topics = Array.from({ length: 15 }, (_, i) => ({
      FirstURL: `https://ddg.com/${i}`,
      Text: `Topic ${i} — description`,
    }));

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        AbstractText: 'Abstract',
        AbstractURL: 'https://example.com',
        Heading: 'Heading',
        RelatedTopics: topics,
      }),
    }) as unknown as typeof fetch;

    const results = await client.search({ query: 'test', maxResults: 3 });
    expect(results).toHaveLength(3);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd museum-backend && pnpm test -- --testPathPattern=tests/unit/chat/duckduckgo-client`
Expected: FAIL — module not found

- [x] **Step 3: Write the implementation**

```typescript
// src/modules/chat/adapters/secondary/duckduckgo.client.ts
import { logger } from '@shared/logger/logger';

import type {
  SearchResult,
  WebSearchProvider,
  WebSearchQuery,
} from '../../domain/ports/web-search.port';

const DDG_API_URL = 'https://api.duckduckgo.com/';
const HARD_RESULT_LIMIT = 10;

interface DdgRelatedTopic {
  FirstURL?: string;
  Text?: string;
}

interface DdgResponse {
  AbstractText?: string;
  AbstractURL?: string;
  Heading?: string;
  RelatedTopics?: (DdgRelatedTopic | { Topics?: DdgRelatedTopic[] })[];
}

/**
 * DuckDuckGo Instant Answer API adapter implementing {@link WebSearchProvider}.
 *
 * Uses the free Instant Answer API (no key required). Returns abstract +
 * related topics. Quality is lower than dedicated search APIs but always
 * available as a last resort. Never throws.
 */
export class DuckDuckGoClient implements WebSearchProvider {
  readonly name = 'duckduckgo';

  async search(query: WebSearchQuery): Promise<SearchResult[]> {
    if (!query.query.trim()) return [];

    const maxResults = Math.min(query.maxResults ?? 5, HARD_RESULT_LIMIT);

    const url = new URL(DDG_API_URL);
    url.searchParams.set('q', query.query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('no_html', '1');
    url.searchParams.set('skip_disambig', '1');

    try {
      const response = await fetch(url.toString(), { signal: query.signal });

      if (!response.ok) {
        logger.warn('ddg_http_error', {
          status: response.status,
          query: query.query,
        });
        return [];
      }

      const data = (await response.json()) as DdgResponse;
      return this.mapResults(data, maxResults);
    } catch (err) {
      logger.warn('ddg_exception', {
        error: err instanceof Error ? err.message : String(err),
        query: query.query,
      });
      return [];
    }
  }

  private mapResults(data: DdgResponse, maxResults: number): SearchResult[] {
    const results: SearchResult[] = [];

    // Abstract result (the main answer)
    if (data.AbstractText && data.AbstractURL) {
      results.push({
        url: data.AbstractURL,
        title: data.Heading ?? 'DuckDuckGo',
        snippet: data.AbstractText,
      });
    }

    // Related topics (flat + nested groups)
    for (const topic of data.RelatedTopics ?? []) {
      if (results.length >= maxResults) break;

      if ('FirstURL' in topic && topic.FirstURL && topic.Text) {
        const dashIdx = topic.Text.indexOf(' — ');
        const title = dashIdx > 0 ? topic.Text.slice(0, dashIdx) : topic.Text.slice(0, 80);
        const snippet = dashIdx > 0 ? topic.Text.slice(dashIdx + 3) : topic.Text;
        results.push({ url: topic.FirstURL, title, snippet });
      } else if ('Topics' in topic && topic.Topics) {
        for (const sub of topic.Topics) {
          if (results.length >= maxResults) break;
          if (sub.FirstURL && sub.Text) {
            const dashIdx = sub.Text.indexOf(' — ');
            const title = dashIdx > 0 ? sub.Text.slice(0, dashIdx) : sub.Text.slice(0, 80);
            const snippet = dashIdx > 0 ? sub.Text.slice(dashIdx + 3) : sub.Text;
            results.push({ url: sub.FirstURL, title, snippet });
          }
        }
      }
    }

    return results.slice(0, maxResults);
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd museum-backend && pnpm test -- --testPathPattern=tests/unit/chat/duckduckgo-client`
Expected: PASS (all 6 tests)

- [x] **Step 5: Commit**

```bash
cd museum-backend && git add src/modules/chat/adapters/secondary/duckduckgo.client.ts tests/unit/chat/duckduckgo-client.test.ts
git commit -m "feat(web-search): add DuckDuckGo Instant Answer client with tests"
```

---

### Task 5: FallbackSearchProvider

**Files:**
- Create: `src/modules/chat/adapters/secondary/fallback-search.provider.ts`
- Modify: `src/modules/chat/domain/ports/web-search.port.ts`
- Test: `tests/unit/chat/fallback-search-provider.test.ts`

- [x] **Step 1: Add `name` to WebSearchProvider port**

In `src/modules/chat/domain/ports/web-search.port.ts`, add an optional `name` field:

```typescript
/** Port for web search providers (e.g., Tavily). */
export interface WebSearchProvider {
  /** Human-readable provider name for logging. */
  readonly name?: string;
  /** Searches the web. Returns empty array if not found or on any error. */
  search(query: WebSearchQuery): Promise<SearchResult[]>;
}
```

- [x] **Step 2: Write the failing test**

```typescript
// tests/unit/chat/fallback-search-provider.test.ts
import { FallbackSearchProvider } from '@modules/chat/adapters/secondary/fallback-search.provider';

import type { WebSearchProvider, WebSearchQuery } from '@modules/chat/domain/ports/web-search.port';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

function makeProvider(
  name: string,
  behavior: 'success' | 'empty' | 'throw',
): WebSearchProvider {
  return {
    name,
    search: jest.fn().mockImplementation(async () => {
      if (behavior === 'throw') throw new Error(`${name} failed`);
      if (behavior === 'empty') return [];
      return [{ url: `https://${name}.com`, title: name, snippet: `From ${name}` }];
    }),
  };
}

describe('FallbackSearchProvider', () => {
  it('returns results from the first successful provider', async () => {
    const p1 = makeProvider('first', 'success');
    const p2 = makeProvider('second', 'success');
    const fallback = new FallbackSearchProvider([p1, p2]);

    const results = await fallback.search({ query: 'test' });

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('first');
    expect(p2.search).not.toHaveBeenCalled();
  });

  it('falls back on provider error', async () => {
    const p1 = makeProvider('failing', 'throw');
    const p2 = makeProvider('working', 'success');
    const fallback = new FallbackSearchProvider([p1, p2]);

    const results = await fallback.search({ query: 'test' });

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('working');
  });

  it('falls back on empty results', async () => {
    const p1 = makeProvider('empty', 'empty');
    const p2 = makeProvider('full', 'success');
    const fallback = new FallbackSearchProvider([p1, p2]);

    const results = await fallback.search({ query: 'test' });

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('full');
  });

  it('returns empty array when all providers fail', async () => {
    const p1 = makeProvider('a', 'throw');
    const p2 = makeProvider('b', 'throw');
    const fallback = new FallbackSearchProvider([p1, p2]);

    const results = await fallback.search({ query: 'test' });
    expect(results).toEqual([]);
  });

  it('returns empty array with no providers', async () => {
    const fallback = new FallbackSearchProvider([]);
    const results = await fallback.search({ query: 'test' });
    expect(results).toEqual([]);
  });

  it('passes query through to providers', async () => {
    const p1 = makeProvider('spy', 'success');
    const fallback = new FallbackSearchProvider([p1]);

    const query: WebSearchQuery = { query: 'mona lisa', maxResults: 3 };
    await fallback.search(query);

    expect(p1.search).toHaveBeenCalledWith(query);
  });
});
```

- [x] **Step 3: Run test to verify it fails**

Run: `cd museum-backend && pnpm test -- --testPathPattern=tests/unit/chat/fallback-search-provider`
Expected: FAIL — module not found

- [x] **Step 4: Write the implementation**

```typescript
// src/modules/chat/adapters/secondary/fallback-search.provider.ts
import { logger } from '@shared/logger/logger';

import type {
  SearchResult,
  WebSearchProvider,
  WebSearchQuery,
} from '../../domain/ports/web-search.port';

/**
 * Sequential fallback across multiple search providers.
 *
 * Tries each provider in priority order. Returns results from the
 * first provider that succeeds with non-empty results. If all
 * providers fail or return empty, returns `[]` (fail-open).
 */
export class FallbackSearchProvider implements WebSearchProvider {
  readonly name = 'fallback';

  constructor(private readonly providers: WebSearchProvider[]) {}

  async search(query: WebSearchQuery): Promise<SearchResult[]> {
    for (const provider of this.providers) {
      const providerName = provider.name ?? 'unknown';
      try {
        const results = await provider.search(query);
        if (results.length > 0) {
          logger.info('fallback_search_hit', {
            provider: providerName,
            query: query.query,
            resultCount: results.length,
          });
          return results;
        }
        logger.info('fallback_search_empty', {
          provider: providerName,
          query: query.query,
        });
      } catch (err) {
        logger.warn('fallback_search_provider_error', {
          provider: providerName,
          error: err instanceof Error ? err.message : String(err),
          query: query.query,
        });
      }
    }

    logger.warn('fallback_search_all_failed', { query: query.query });
    return [];
  }
}
```

- [x] **Step 5: Run test to verify it passes**

Run: `cd museum-backend && pnpm test -- --testPathPattern=tests/unit/chat/fallback-search-provider`
Expected: PASS (all 6 tests)

- [x] **Step 6: Commit**

```bash
cd museum-backend && git add src/modules/chat/domain/ports/web-search.port.ts src/modules/chat/adapters/secondary/fallback-search.provider.ts tests/unit/chat/fallback-search-provider.test.ts
git commit -m "feat(web-search): add FallbackSearchProvider with sequential failover"
```

---

### Task 6: Environment Config + Wiring

**Files:**
- Modify: `src/config/env.types.ts`
- Modify: `src/config/env.ts`
- Modify: `src/modules/chat/index.ts`

- [x] **Step 1: Update env.types.ts — add provider config types**

Add after the existing `webSearch` type block:

```typescript
webSearch: {
  tavilyApiKey?: string;
  googleCseApiKey?: string;
  googleCseId?: string;
  braveSearchApiKey?: string;
  searxngInstances: string[];
  timeoutMs: number;
  cacheTtlSeconds: number;
  maxResults: number;
};
```

- [x] **Step 2: Update env.ts — add provider env vars**

Replace the `webSearch` section with:

```typescript
webSearch: {
  tavilyApiKey: toOptionalString(process.env.TAVILY_API_KEY),
  googleCseApiKey: toOptionalString(process.env.GOOGLE_CSE_API_KEY),
  googleCseId: toOptionalString(process.env.GOOGLE_CSE_ID),
  braveSearchApiKey: toOptionalString(process.env.BRAVE_SEARCH_API_KEY),
  searxngInstances: (process.env.SEARXNG_INSTANCES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  timeoutMs: toNumber(process.env.WEB_SEARCH_TIMEOUT_MS, 3000),
  cacheTtlSeconds: toNumber(process.env.WEB_SEARCH_CACHE_TTL_SECONDS, 3600),
  maxResults: toNumber(process.env.WEB_SEARCH_MAX_RESULTS, 5),
},
```

- [x] **Step 3: Update chat/index.ts — rebuild buildWebSearch() for fallback chain**

Replace the `buildWebSearch()` method:

```typescript
import { TavilyClient } from './adapters/secondary/tavily.client';
import { GoogleCseClient } from './adapters/secondary/google-cse.client';
import { BraveSearchClient } from './adapters/secondary/brave-search.client';
import { SearxngClient } from './adapters/secondary/searxng.client';
import { DuckDuckGoClient } from './adapters/secondary/duckduckgo.client';
import { FallbackSearchProvider } from './adapters/secondary/fallback-search.provider';

// ... inside ChatModule class ...

/** Creates the web search service with multi-provider fallback chain. */
private buildWebSearch(cache?: CacheService): WebSearchService | undefined {
  if (!env.featureFlags.webSearch) return undefined;

  const providers: WebSearchProvider[] = [];

  if (env.webSearch.tavilyApiKey) {
    providers.push(new TavilyClient(env.webSearch.tavilyApiKey));
  }
  if (env.webSearch.googleCseApiKey && env.webSearch.googleCseId) {
    providers.push(
      new GoogleCseClient(env.webSearch.googleCseApiKey, env.webSearch.googleCseId),
    );
  }
  if (env.webSearch.braveSearchApiKey) {
    providers.push(new BraveSearchClient(env.webSearch.braveSearchApiKey));
  }
  if (env.webSearch.searxngInstances.length > 0) {
    providers.push(new SearxngClient(env.webSearch.searxngInstances));
  }
  // DuckDuckGo: always available, no key needed — last resort
  providers.push(new DuckDuckGoClient());

  if (providers.length === 0) {
    logger.warn('web_search_disabled_no_providers', {
      reason: 'No web search providers configured',
    });
    return undefined;
  }

  logger.info('web_search_providers_configured', {
    providers: providers.map((p) => p.name ?? 'unknown'),
    count: providers.length,
  });

  const fallbackProvider = new FallbackSearchProvider(providers);
  return new WebSearchService(
    fallbackProvider,
    {
      timeoutMs: env.webSearch.timeoutMs,
      cacheTtlSeconds: env.webSearch.cacheTtlSeconds,
      maxResults: env.webSearch.maxResults,
    },
    cache,
  );
}
```

- [x] **Step 4: Add `name` to existing TavilyClient**

In `src/modules/chat/adapters/secondary/tavily.client.ts`, add inside the class:

```typescript
readonly name = 'tavily';
```

- [x] **Step 5: Run existing tests to verify no regression**

Run: `cd museum-backend && pnpm test -- --testPathPattern=tests/unit/chat/`
Expected: ALL PASS (existing tavily tests + all new provider tests)

- [x] **Step 6: Run typecheck**

Run: `cd museum-backend && pnpm lint`
Expected: 0 errors

- [x] **Step 7: Commit**

```bash
cd museum-backend && git add src/config/env.ts src/config/env.types.ts src/modules/chat/index.ts src/modules/chat/adapters/secondary/tavily.client.ts
git commit -m "feat(web-search): wire multi-provider fallback chain (Tavily→Google→Brave→SearXNG→DDG)"
```

---

## Phase 2 — Knowledge Extraction Module

### Task 7: Install New Dependencies

**Files:**
- Modify: `package.json`

- [x] **Step 1: Install production dependencies**

Run: `cd museum-backend && pnpm add bullmq cheerio @mozilla/readability robots-parser`

- [x] **Step 2: Install type definitions**

Run: `cd museum-backend && pnpm add -D @types/jsdom`

Note: `@mozilla/readability` requires a DOM parser. We'll use `jsdom` (already available via Jest) for the readability step. If not present:

Run: `cd museum-backend && pnpm add jsdom && pnpm add -D @types/jsdom`

- [x] **Step 3: Verify install**

Run: `cd museum-backend && pnpm lint`
Expected: 0 errors

- [x] **Step 4: Commit**

```bash
cd museum-backend && git add package.json pnpm-lock.yaml
git commit -m "chore: add bullmq, cheerio, readability, robots-parser deps"
```

---

### Task 8: Test Factories for Knowledge Extraction

**Files:**
- Create: `tests/helpers/knowledge-extraction/extraction.fixtures.ts`

- [x] **Step 1: Create test factories**

```typescript
// tests/helpers/knowledge-extraction/extraction.fixtures.ts
import { ExtractedContent, ExtractedContentStatus } from '@modules/knowledge-extraction/domain/extracted-content.entity';
import { ArtworkKnowledge } from '@modules/knowledge-extraction/domain/artwork-knowledge.entity';
import { MuseumEnrichment } from '@modules/knowledge-extraction/domain/museum-enrichment.entity';

export function makeExtractedContent(
  overrides?: Partial<ExtractedContent>,
): ExtractedContent {
  const content = new ExtractedContent();
  content.id = overrides?.id ?? '00000000-0000-0000-0000-000000000001';
  content.url = overrides?.url ?? 'https://example.com/test-page';
  content.title = overrides?.title ?? 'Test Page Title';
  content.textContent = overrides?.textContent ?? 'This is the extracted text content of the page.';
  content.scrapedAt = overrides?.scrapedAt ?? new Date('2026-04-10T12:00:00Z');
  content.contentHash = overrides?.contentHash ?? 'abc123hash';
  content.status = overrides?.status ?? ExtractedContentStatus.SCRAPED;
  return content;
}

export function makeArtworkKnowledge(
  overrides?: Partial<ArtworkKnowledge>,
): ArtworkKnowledge {
  const artwork = new ArtworkKnowledge();
  artwork.id = overrides?.id ?? '00000000-0000-0000-0000-000000000002';
  artwork.title = overrides?.title ?? 'Mona Lisa';
  artwork.artist = overrides?.artist ?? 'Leonardo da Vinci';
  artwork.period = overrides?.period ?? 'Renaissance';
  artwork.technique = overrides?.technique ?? 'Oil on poplar panel';
  artwork.description = overrides?.description ?? 'A half-length portrait painting.';
  artwork.historicalContext = overrides?.historicalContext ?? null;
  artwork.dimensions = overrides?.dimensions ?? '77 cm × 53 cm';
  artwork.currentLocation = overrides?.currentLocation ?? 'Louvre Museum, Room 711';
  artwork.sourceUrls = overrides?.sourceUrls ?? ['https://example.com/mona-lisa'];
  artwork.confidence = overrides?.confidence ?? 0.85;
  artwork.needsReview = overrides?.needsReview ?? false;
  artwork.locale = overrides?.locale ?? 'en';
  artwork.createdAt = overrides?.createdAt ?? new Date('2026-04-10T12:00:00Z');
  artwork.updatedAt = overrides?.updatedAt ?? new Date('2026-04-10T12:00:00Z');
  return artwork;
}

export function makeMuseumEnrichment(
  overrides?: Partial<MuseumEnrichment>,
): MuseumEnrichment {
  const museum = new MuseumEnrichment();
  museum.id = overrides?.id ?? '00000000-0000-0000-0000-000000000003';
  museum.museumId = overrides?.museumId ?? null;
  museum.name = overrides?.name ?? 'Louvre Museum';
  museum.openingHours = overrides?.openingHours ?? null;
  museum.admissionFees = overrides?.admissionFees ?? null;
  museum.website = overrides?.website ?? 'https://www.louvre.fr';
  museum.collections = overrides?.collections ?? null;
  museum.currentExhibitions = overrides?.currentExhibitions ?? null;
  museum.accessibility = overrides?.accessibility ?? null;
  museum.sourceUrls = overrides?.sourceUrls ?? ['https://example.com/louvre'];
  museum.confidence = overrides?.confidence ?? 0.9;
  museum.needsReview = overrides?.needsReview ?? false;
  museum.locale = overrides?.locale ?? 'en';
  museum.createdAt = overrides?.createdAt ?? new Date('2026-04-10T12:00:00Z');
  museum.updatedAt = overrides?.updatedAt ?? new Date('2026-04-10T12:00:00Z');
  return museum;
}
```

Note: this file will compile once entities are created in Task 9. Keep it ready.

- [x] **Step 2: Commit**

```bash
cd museum-backend && git add tests/helpers/knowledge-extraction/extraction.fixtures.ts
git commit -m "test: add knowledge-extraction test factories"
```

---

### Task 9: Domain Entities

**Files:**
- Create: `src/modules/knowledge-extraction/domain/extracted-content.entity.ts`
- Create: `src/modules/knowledge-extraction/domain/artwork-knowledge.entity.ts`
- Create: `src/modules/knowledge-extraction/domain/museum-enrichment.entity.ts`
- Modify: `src/data/db/data-source.ts`

- [x] **Step 1: Create ExtractedContent entity**

```typescript
// src/modules/knowledge-extraction/domain/extracted-content.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum ExtractedContentStatus {
  SCRAPED = 'scraped',
  CLASSIFIED = 'classified',
  FAILED = 'failed',
  LOW_CONFIDENCE = 'low_confidence',
}

@Entity({ name: 'extracted_content' })
export class ExtractedContent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 2048 })
  url!: string;

  @Column({ type: 'varchar', length: 500 })
  title!: string;

  @Column({ type: 'text' })
  textContent!: string;

  @CreateDateColumn({ type: 'timestamp' })
  scrapedAt!: Date;

  @Column({ type: 'varchar', length: 64 })
  contentHash!: string;

  @Column({
    type: 'enum',
    enum: ExtractedContentStatus,
    default: ExtractedContentStatus.SCRAPED,
  })
  status!: ExtractedContentStatus;
}
```

- [x] **Step 2: Create ArtworkKnowledge entity**

```typescript
// src/modules/knowledge-extraction/domain/artwork-knowledge.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'artwork_knowledge' })
@Index('IDX_artwork_knowledge_title_artist_locale', ['title', 'artist', 'locale'], {
  unique: true,
})
export class ArtworkKnowledge {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 500 })
  title!: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  artist!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  period!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  technique!: string | null;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'text', nullable: true })
  historicalContext!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  dimensions!: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  currentLocation!: string | null;

  @Column({ type: 'jsonb', default: [] })
  sourceUrls!: string[];

  @Column({ type: 'float' })
  confidence!: number;

  @Column({ type: 'boolean', default: false })
  needsReview!: boolean;

  @Column({ type: 'varchar', length: 10 })
  locale!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
```

- [x] **Step 3: Create MuseumEnrichment entity**

```typescript
// src/modules/knowledge-extraction/domain/museum-enrichment.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Museum } from '@modules/museum/domain/museum.entity';

@Entity({ name: 'museum_enrichment' })
@Index('IDX_museum_enrichment_name_locale', ['name', 'locale'], { unique: true })
export class MuseumEnrichment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Museum, { nullable: true, onDelete: 'SET NULL' })
  museum?: Museum | null;

  @Column({ type: 'uuid', nullable: true })
  museumId!: string | null;

  @Column({ type: 'varchar', length: 300 })
  name!: string;

  @Column({ type: 'jsonb', nullable: true })
  openingHours!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  admissionFees!: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  website!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  collections!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  currentExhibitions!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  accessibility!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', default: [] })
  sourceUrls!: string[];

  @Column({ type: 'float' })
  confidence!: number;

  @Column({ type: 'boolean', default: false })
  needsReview!: boolean;

  @Column({ type: 'varchar', length: 10 })
  locale!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
```

- [x] **Step 4: Register entities in data-source.ts**

Add imports and include in the `entities` array:

```typescript
import { ExtractedContent } from '@modules/knowledge-extraction/domain/extracted-content.entity';
import { ArtworkKnowledge } from '@modules/knowledge-extraction/domain/artwork-knowledge.entity';
import { MuseumEnrichment } from '@modules/knowledge-extraction/domain/museum-enrichment.entity';

// In entities array, add:
  ExtractedContent,
  ArtworkKnowledge,
  MuseumEnrichment,
```

- [x] **Step 5: Run typecheck**

Run: `cd museum-backend && pnpm lint`
Expected: 0 errors

- [x] **Step 6: Commit**

```bash
cd museum-backend && git add src/modules/knowledge-extraction/domain/ src/data/db/data-source.ts
git commit -m "feat(knowledge-extraction): add ExtractedContent, ArtworkKnowledge, MuseumEnrichment entities"
```

---

### Task 10: Database Migrations

**Files:**
- Create: `src/data/db/migrations/<timestamp>-CreateKnowledgeExtractionTables.ts` (auto-generated)

- [x] **Step 1: Start local DB if not running**

Run: `cd museum-backend && docker compose -f docker-compose.dev.yml up -d`

- [x] **Step 2: Run pending migrations (ensure clean state)**

Run: `cd museum-backend && pnpm migration:run`

- [x] **Step 3: Generate migration**

Run: `cd museum-backend && node scripts/migration-cli.cjs generate --name=CreateKnowledgeExtractionTables`
Expected: creates a migration file in `src/data/db/migrations/`

- [x] **Step 4: Review the generated migration**

Read the generated file. Verify it creates:
- `extracted_content` table with all columns
- `artwork_knowledge` table with all columns + unique index
- `museum_enrichment` table with all columns + unique index + FK to museums

- [x] **Step 5: Add pg_trgm extension and GIN indexes to the migration**

Manually add to the `up()` method of the generated migration, at the top:

```typescript
await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
```

And at the bottom of `up()`:

```typescript
await queryRunner.query(`CREATE INDEX "IDX_artwork_knowledge_title_trgm" ON "artwork_knowledge" USING GIN ("title" gin_trgm_ops)`);
await queryRunner.query(`CREATE INDEX "IDX_museum_enrichment_name_trgm" ON "museum_enrichment" USING GIN ("name" gin_trgm_ops)`);
```

And in `down()`, before dropping the tables:

```typescript
await queryRunner.query(`DROP INDEX IF EXISTS "IDX_museum_enrichment_name_trgm"`);
await queryRunner.query(`DROP INDEX IF EXISTS "IDX_artwork_knowledge_title_trgm"`);
```

- [x] **Step 6: Apply the migration**

Run: `cd museum-backend && pnpm migration:run`
Expected: migration applied successfully

- [x] **Step 7: Verify no schema drift**

Run: `cd museum-backend && node scripts/migration-cli.cjs generate --name=Check`
Expected: empty migration (no drift). Delete the empty migration file.

- [x] **Step 8: Commit**

```bash
cd museum-backend && git add src/data/db/migrations/
git commit -m "feat(knowledge-extraction): add DB migrations for 3 extraction tables + pg_trgm indexes"
```

---

### Task 11: Domain Ports (Knowledge Extraction)

**Files:**
- Create: `src/modules/knowledge-extraction/domain/ports/scraper.port.ts`
- Create: `src/modules/knowledge-extraction/domain/ports/content-classifier.port.ts`
- Create: `src/modules/knowledge-extraction/domain/ports/extraction-queue.port.ts`

- [x] **Step 1: Create scraper port**

```typescript
// src/modules/knowledge-extraction/domain/ports/scraper.port.ts

/** Result of scraping a single URL. */
export interface ScrapedPage {
  url: string;
  title: string;
  textContent: string;
  contentHash: string;
}

/** Port for HTML scraping adapters. */
export interface ScraperPort {
  /** Scrapes the given URL. Returns null if scraping fails or is disallowed. */
  scrape(url: string, signal?: AbortSignal): Promise<ScrapedPage | null>;
}
```

- [x] **Step 2: Create content classifier port**

```typescript
// src/modules/knowledge-extraction/domain/ports/content-classifier.port.ts

/** Artwork data extracted by the classifier. */
export interface ClassifiedArtworkData {
  title: string;
  artist: string | null;
  period: string | null;
  technique: string | null;
  description: string;
  historicalContext: string | null;
  dimensions: string | null;
  currentLocation: string | null;
}

/** Museum data extracted by the classifier. */
export interface ClassifiedMuseumData {
  name: string;
  openingHours: Record<string, unknown> | null;
  admissionFees: Record<string, unknown> | null;
  website: string | null;
  collections: Record<string, unknown> | null;
  currentExhibitions: Record<string, unknown> | null;
  accessibility: Record<string, unknown> | null;
}

/** Result of classifying scraped content. */
export type ClassificationResult =
  | { type: 'artwork'; confidence: number; data: ClassifiedArtworkData }
  | { type: 'museum'; confidence: number; data: ClassifiedMuseumData }
  | { type: 'irrelevant'; confidence: number; data: null };

/** Port for LLM-based content classification. */
export interface ContentClassifierPort {
  /** Classifies scraped text content. Returns null on any LLM error. */
  classify(textContent: string, locale: string): Promise<ClassificationResult | null>;
}
```

- [x] **Step 3: Create extraction queue port**

```typescript
// src/modules/knowledge-extraction/domain/ports/extraction-queue.port.ts

/** Job payload for URL extraction. */
export interface ExtractionJobPayload {
  url: string;
  searchTerm: string;
  locale: string;
}

/** Port for the extraction job queue. */
export interface ExtractionQueuePort {
  /** Enqueues URLs for background extraction. Fire-and-forget. */
  enqueueUrls(jobs: ExtractionJobPayload[]): Promise<void>;
}
```

- [x] **Step 4: Commit**

```bash
cd museum-backend && git add src/modules/knowledge-extraction/domain/ports/
git commit -m "feat(knowledge-extraction): add scraper, classifier, and queue domain ports"
```

---

### Task 12: HTML Scraper Adapter

**Files:**
- Create: `src/modules/knowledge-extraction/adapters/secondary/html-scraper.ts`
- Test: `tests/unit/knowledge-extraction/html-scraper.test.ts`

- [x] **Step 1: Write the failing test**

```typescript
// tests/unit/knowledge-extraction/html-scraper.test.ts
import { HtmlScraper } from '@modules/knowledge-extraction/adapters/secondary/html-scraper';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

const HTML_PAGE = `
<!DOCTYPE html>
<html><head><title>Mona Lisa — Louvre Museum</title></head>
<body>
<nav>Menu items here</nav>
<article>
  <h1>Mona Lisa</h1>
  <p>The Mona Lisa is a half-length portrait painting by Italian artist Leonardo da Vinci.
  Considered an archetypal masterpiece of the Italian Renaissance, it has been described
  as the best known, the most visited, the most written about and the most parodied work
  of art in the world.</p>
</article>
<footer>Copyright 2026</footer>
</body></html>`;

describe('HtmlScraper', () => {
  const scraper = new HtmlScraper({ timeoutMs: 5000, maxContentBytes: 51200 });

  it('extracts readable content from HTML', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
      text: async () => HTML_PAGE,
    }) as unknown as typeof fetch;

    const result = await scraper.scrape('https://example.com/mona-lisa');

    expect(result).not.toBeNull();
    expect(result!.title).toContain('Mona Lisa');
    expect(result!.textContent).toContain('Leonardo da Vinci');
    expect(result!.url).toBe('https://example.com/mona-lisa');
    expect(result!.contentHash).toBeTruthy();
  });

  it('returns null on HTTP error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers({}),
    }) as unknown as typeof fetch;

    const result = await scraper.scrape('https://example.com/missing');
    expect(result).toBeNull();
  });

  it('returns null on non-HTML content type', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/pdf' }),
    }) as unknown as typeof fetch;

    const result = await scraper.scrape('https://example.com/file.pdf');
    expect(result).toBeNull();
  });

  it('returns null on network failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(
      new Error('ECONNREFUSED'),
    ) as unknown as typeof fetch;

    const result = await scraper.scrape('https://down.example.com');
    expect(result).toBeNull();
  });

  it('returns null for empty query', async () => {
    const result = await scraper.scrape('');
    expect(result).toBeNull();
  });

  it('truncates content exceeding maxContentBytes', async () => {
    const longText = 'A'.repeat(60000);
    const longHtml = `<html><head><title>Big</title></head><body><article><p>${longText}</p></article></body></html>`;

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html' }),
      text: async () => longHtml,
    }) as unknown as typeof fetch;

    const scraper51k = new HtmlScraper({ timeoutMs: 5000, maxContentBytes: 51200 });
    const result = await scraper51k.scrape('https://example.com/big');

    expect(result).not.toBeNull();
    expect(result!.textContent.length).toBeLessThanOrEqual(51200);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd museum-backend && pnpm test -- --testPathPattern=tests/unit/knowledge-extraction/html-scraper`
Expected: FAIL — module not found

- [x] **Step 3: Write the implementation**

```typescript
// src/modules/knowledge-extraction/adapters/secondary/html-scraper.ts
import { createHash } from 'node:crypto';

import * as cheerio from 'cheerio';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

import { logger } from '@shared/logger/logger';

import type { ScrapedPage, ScraperPort } from '../../domain/ports/scraper.port';

interface HtmlScraperConfig {
  timeoutMs: number;
  maxContentBytes: number;
}

const ALLOWED_CONTENT_TYPES = ['text/html', 'application/xhtml+xml'];
const USER_AGENT = 'MusaiumBot/1.0 (+https://musaium.app; museum-knowledge-enrichment)';

/**
 * HTML scraper using @mozilla/readability + cheerio.
 *
 * Extracts the main readable content from a web page, strips navigation,
 * ads, and footers. Returns null on any failure (fail-open).
 */
export class HtmlScraper implements ScraperPort {
  constructor(private readonly config: HtmlScraperConfig) {}

  async scrape(url: string, signal?: AbortSignal): Promise<ScrapedPage | null> {
    if (!url.trim()) return null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

      // Chain external signal
      if (signal) {
        signal.addEventListener('abort', () => controller.abort(), { once: true });
      }

      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': USER_AGENT },
          signal: controller.signal,
          redirect: 'follow',
        });

        if (!response.ok) {
          logger.warn('scraper_http_error', { url, status: response.status });
          return null;
        }

        const contentType = response.headers.get('content-type') ?? '';
        if (!ALLOWED_CONTENT_TYPES.some((ct) => contentType.includes(ct))) {
          logger.info('scraper_skip_non_html', { url, contentType });
          return null;
        }

        const html = await response.text();
        return this.extractContent(url, html);
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      logger.warn('scraper_exception', {
        url,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  private extractContent(url: string, html: string): ScrapedPage | null {
    // Use Readability to extract main content
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article?.textContent) {
      // Fallback: use cheerio to extract body text
      const $ = cheerio.load(html);
      $('script, style, nav, footer, header').remove();
      const text = $('body').text().replace(/\s+/g, ' ').trim();

      if (!text) return null;

      return {
        url,
        title: $('title').text().trim() || url,
        textContent: text.slice(0, this.config.maxContentBytes),
        contentHash: createHash('sha256').update(text).digest('hex').slice(0, 16),
      };
    }

    const textContent = article.textContent
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, this.config.maxContentBytes);

    return {
      url,
      title: article.title || url,
      textContent,
      contentHash: createHash('sha256').update(textContent).digest('hex').slice(0, 16),
    };
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd museum-backend && pnpm test -- --testPathPattern=tests/unit/knowledge-extraction/html-scraper`
Expected: PASS (all 6 tests)

- [x] **Step 5: Commit**

```bash
cd museum-backend && git add src/modules/knowledge-extraction/adapters/secondary/html-scraper.ts tests/unit/knowledge-extraction/html-scraper.test.ts
git commit -m "feat(knowledge-extraction): add HTML scraper with readability + cheerio"
```

---

### Task 13: Content Classifier Service (LangChain)

**Files:**
- Create: `src/modules/knowledge-extraction/useCase/content-classifier.service.ts`
- Test: `tests/unit/knowledge-extraction/content-classifier.test.ts`

- [x] **Step 1: Write the failing test**

```typescript
// tests/unit/knowledge-extraction/content-classifier.test.ts
import { ContentClassifierService } from '@modules/knowledge-extraction/useCase/content-classifier.service';

import type { ContentClassifierPort } from '@modules/knowledge-extraction/domain/ports/content-classifier.port';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// Mock the LangChain model
const mockInvoke = jest.fn();
const mockWithStructuredOutput = jest.fn().mockReturnValue({ invoke: mockInvoke });
const mockChatOpenAI = jest.fn().mockImplementation(() => ({
  withStructuredOutput: mockWithStructuredOutput,
}));

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: mockChatOpenAI,
}));

describe('ContentClassifierService', () => {
  let classifier: ContentClassifierPort;

  beforeEach(() => {
    jest.clearAllMocks();
    classifier = new ContentClassifierService('fake-openai-key', 'gpt-4o-mini');
  });

  it('classifies artwork content correctly', async () => {
    mockInvoke.mockResolvedValue({
      type: 'artwork',
      confidence: 0.92,
      data: {
        title: 'Mona Lisa',
        artist: 'Leonardo da Vinci',
        period: 'Renaissance',
        technique: 'Oil on poplar panel',
        description: 'A half-length portrait painting.',
        historicalContext: null,
        dimensions: '77 cm × 53 cm',
        currentLocation: 'Louvre Museum',
      },
    });

    const result = await classifier.classify('Text about the Mona Lisa...', 'en');

    expect(result).not.toBeNull();
    expect(result!.type).toBe('artwork');
    expect(result!.confidence).toBe(0.92);
    expect(result!.data).toEqual(expect.objectContaining({ title: 'Mona Lisa' }));
  });

  it('classifies museum content correctly', async () => {
    mockInvoke.mockResolvedValue({
      type: 'museum',
      confidence: 0.88,
      data: {
        name: 'Louvre Museum',
        openingHours: { monday: 'closed', tuesday: '9:00-18:00' },
        admissionFees: { adult: '17€', under18: 'free' },
        website: 'https://www.louvre.fr',
        collections: null,
        currentExhibitions: null,
        accessibility: null,
      },
    });

    const result = await classifier.classify('Text about the Louvre...', 'en');

    expect(result).not.toBeNull();
    expect(result!.type).toBe('museum');
    expect(result!.data).toEqual(expect.objectContaining({ name: 'Louvre Museum' }));
  });

  it('returns irrelevant for off-topic content', async () => {
    mockInvoke.mockResolvedValue({
      type: 'irrelevant',
      confidence: 0.95,
      data: null,
    });

    const result = await classifier.classify('Best pizza recipes in Paris...', 'en');

    expect(result).not.toBeNull();
    expect(result!.type).toBe('irrelevant');
    expect(result!.data).toBeNull();
  });

  it('returns null on LLM error', async () => {
    mockInvoke.mockRejectedValue(new Error('LLM timeout'));

    const result = await classifier.classify('some text', 'en');
    expect(result).toBeNull();
  });

  it('returns null for empty text', async () => {
    const result = await classifier.classify('', 'en');
    expect(result).toBeNull();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd museum-backend && pnpm test -- --testPathPattern=tests/unit/knowledge-extraction/content-classifier`
Expected: FAIL — module not found

- [x] **Step 3: Write the implementation**

```typescript
// src/modules/knowledge-extraction/useCase/content-classifier.service.ts
import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';

import { logger } from '@shared/logger/logger';

import type {
  ClassificationResult,
  ContentClassifierPort,
} from '../domain/ports/content-classifier.port';

const artworkDataSchema = z.object({
  title: z.string(),
  artist: z.string().nullable(),
  period: z.string().nullable(),
  technique: z.string().nullable(),
  description: z.string(),
  historicalContext: z.string().nullable(),
  dimensions: z.string().nullable(),
  currentLocation: z.string().nullable(),
});

const museumDataSchema = z.object({
  name: z.string(),
  openingHours: z.record(z.unknown()).nullable(),
  admissionFees: z.record(z.unknown()).nullable(),
  website: z.string().nullable(),
  collections: z.record(z.unknown()).nullable(),
  currentExhibitions: z.record(z.unknown()).nullable(),
  accessibility: z.record(z.unknown()).nullable(),
});

const classificationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('artwork'),
    confidence: z.number().min(0).max(1),
    data: artworkDataSchema,
  }),
  z.object({
    type: z.literal('museum'),
    confidence: z.number().min(0).max(1),
    data: museumDataSchema,
  }),
  z.object({
    type: z.literal('irrelevant'),
    confidence: z.number().min(0).max(1),
    data: z.null(),
  }),
]);

const SYSTEM_PROMPT = `You are a museum data extractor. You receive text from a web page.

1. Determine if the page discusses an ARTWORK, a MUSEUM, or is IRRELEVANT.
2. If artwork: extract title, artist, period, technique, description, historicalContext, dimensions, currentLocation.
3. If museum: extract name, openingHours, admissionFees, website, collections, currentExhibitions, accessibility.
4. If irrelevant: return type "irrelevant".
5. Score your confidence from 0.0 to 1.0.

Rules:
- NEVER invent data. If information is not in the text, return null.
- Prefer factual data over opinions.
- The description field must be informative, not promotional.`;

/**
 * LangChain-based content classifier using structured output.
 *
 * All LLM calls go through LangChain — no exceptions.
 * Returns null on any error (fail-open).
 */
export class ContentClassifierService implements ContentClassifierPort {
  private readonly model: ReturnType<ChatOpenAI['withStructuredOutput']>;

  constructor(openaiApiKey: string, modelName: string) {
    const llm = new ChatOpenAI({
      openAIApiKey: openaiApiKey,
      modelName,
      temperature: 0,
    });
    this.model = llm.withStructuredOutput(classificationSchema);
  }

  async classify(
    textContent: string,
    locale: string,
  ): Promise<ClassificationResult | null> {
    if (!textContent.trim()) return null;

    try {
      const result = await this.model.invoke([
        new SystemMessage(SYSTEM_PROMPT),
        new HumanMessage(
          `Analyze the following web page content (locale: ${locale}):\n\n${textContent}`,
        ),
      ]);

      logger.info('classifier_success', {
        type: result.type,
        confidence: result.confidence,
      });

      return result as ClassificationResult;
    } catch (err) {
      logger.warn('classifier_error', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd museum-backend && pnpm test -- --testPathPattern=tests/unit/knowledge-extraction/content-classifier`
Expected: PASS (all 5 tests)

- [x] **Step 5: Commit**

```bash
cd museum-backend && git add src/modules/knowledge-extraction/useCase/content-classifier.service.ts tests/unit/knowledge-extraction/content-classifier.test.ts
git commit -m "feat(knowledge-extraction): add LangChain content classifier with structured output"
```

---

### Task 14: TypeORM Repositories

**Files:**
- Create: `src/modules/knowledge-extraction/adapters/secondary/typeorm-extracted-content.repo.ts`
- Create: `src/modules/knowledge-extraction/adapters/secondary/typeorm-artwork-knowledge.repo.ts`
- Create: `src/modules/knowledge-extraction/adapters/secondary/typeorm-museum-enrichment.repo.ts`

- [x] **Step 1: Create ExtractedContent repository**

```typescript
// src/modules/knowledge-extraction/adapters/secondary/typeorm-extracted-content.repo.ts
import type { Repository } from 'typeorm';

import {
  ExtractedContent,
  ExtractedContentStatus,
} from '../../domain/extracted-content.entity';

export class TypeOrmExtractedContentRepo {
  constructor(private readonly repo: Repository<ExtractedContent>) {}

  async findByUrl(url: string): Promise<ExtractedContent | null> {
    return this.repo.findOne({ where: { url } });
  }

  async upsert(data: {
    url: string;
    title: string;
    textContent: string;
    contentHash: string;
    status: ExtractedContentStatus;
  }): Promise<ExtractedContent> {
    const existing = await this.findByUrl(data.url);
    if (existing) {
      existing.title = data.title;
      existing.textContent = data.textContent;
      existing.contentHash = data.contentHash;
      existing.status = data.status;
      existing.scrapedAt = new Date();
      return this.repo.save(existing);
    }
    return this.repo.save(this.repo.create(data));
  }

  async updateStatus(
    url: string,
    status: ExtractedContentStatus,
  ): Promise<void> {
    await this.repo.update({ url }, { status });
  }
}
```

- [x] **Step 2: Create ArtworkKnowledge repository**

```typescript
// src/modules/knowledge-extraction/adapters/secondary/typeorm-artwork-knowledge.repo.ts
import type { Repository } from 'typeorm';

import { ArtworkKnowledge } from '../../domain/artwork-knowledge.entity';

export class TypeOrmArtworkKnowledgeRepo {
  constructor(private readonly repo: Repository<ArtworkKnowledge>) {}

  async findByTitleAndLocale(
    title: string,
    locale: string,
  ): Promise<ArtworkKnowledge | null> {
    return this.repo
      .createQueryBuilder('ak')
      .where('LOWER(ak.title) = LOWER(:title)', { title })
      .andWhere('ak.locale = :locale', { locale })
      .getOne();
  }

  async searchByTitle(
    searchTerm: string,
    locale: string,
    limit = 3,
  ): Promise<ArtworkKnowledge[]> {
    return this.repo
      .createQueryBuilder('ak')
      .where('ak.title ILIKE :term', { term: `%${searchTerm}%` })
      .andWhere('ak.locale = :locale', { locale })
      .andWhere('ak.confidence >= :threshold', { threshold: 0.4 })
      .orderBy('ak.confidence', 'DESC')
      .limit(limit)
      .getMany();
  }

  async upsertFromClassification(
    data: Omit<ArtworkKnowledge, 'id' | 'createdAt' | 'updatedAt'>,
    sourceUrl: string,
  ): Promise<ArtworkKnowledge> {
    const existing = await this.findByTitleAndLocale(data.title, data.locale);

    if (existing) {
      // Append source URL
      if (!existing.sourceUrls.includes(sourceUrl)) {
        existing.sourceUrls = [...existing.sourceUrls, sourceUrl];
      }

      if (data.confidence > existing.confidence) {
        // Higher confidence: overwrite data
        Object.assign(existing, data, {
          id: existing.id,
          sourceUrls: existing.sourceUrls,
          createdAt: existing.createdAt,
        });
      } else {
        // Lower confidence: only fill null fields (partial merge)
        for (const key of [
          'artist', 'period', 'technique', 'historicalContext',
          'dimensions', 'currentLocation',
        ] as const) {
          if (existing[key] === null && data[key] !== null) {
            (existing as Record<string, unknown>)[key] = data[key];
          }
        }
      }

      existing.needsReview = data.needsReview;
      return this.repo.save(existing);
    }

    return this.repo.save(
      this.repo.create({ ...data, sourceUrls: [sourceUrl] }),
    );
  }
}
```

- [x] **Step 3: Create MuseumEnrichment repository**

```typescript
// src/modules/knowledge-extraction/adapters/secondary/typeorm-museum-enrichment.repo.ts
import type { Repository } from 'typeorm';

import { MuseumEnrichment } from '../../domain/museum-enrichment.entity';

export class TypeOrmMuseumEnrichmentRepo {
  constructor(private readonly repo: Repository<MuseumEnrichment>) {}

  async findByNameAndLocale(
    name: string,
    locale: string,
  ): Promise<MuseumEnrichment | null> {
    return this.repo
      .createQueryBuilder('me')
      .where('LOWER(me.name) = LOWER(:name)', { name })
      .andWhere('me.locale = :locale', { locale })
      .getOne();
  }

  async searchByName(
    searchTerm: string,
    locale: string,
    limit = 3,
  ): Promise<MuseumEnrichment[]> {
    return this.repo
      .createQueryBuilder('me')
      .where('me.name ILIKE :term', { term: `%${searchTerm}%` })
      .andWhere('me.locale = :locale', { locale })
      .andWhere('me.confidence >= :threshold', { threshold: 0.4 })
      .orderBy('me.confidence', 'DESC')
      .limit(limit)
      .getMany();
  }

  async upsertFromClassification(
    data: Omit<MuseumEnrichment, 'id' | 'museum' | 'createdAt' | 'updatedAt'>,
    sourceUrl: string,
  ): Promise<MuseumEnrichment> {
    const existing = await this.findByNameAndLocale(data.name, data.locale);

    if (existing) {
      if (!existing.sourceUrls.includes(sourceUrl)) {
        existing.sourceUrls = [...existing.sourceUrls, sourceUrl];
      }

      if (data.confidence > existing.confidence) {
        Object.assign(existing, data, {
          id: existing.id,
          museumId: existing.museumId,
          sourceUrls: existing.sourceUrls,
          createdAt: existing.createdAt,
        });
      } else {
        for (const key of [
          'openingHours', 'admissionFees', 'website',
          'collections', 'currentExhibitions', 'accessibility',
        ] as const) {
          if (existing[key] === null && data[key] !== null) {
            (existing as Record<string, unknown>)[key] = data[key];
          }
        }
      }

      existing.needsReview = data.needsReview;
      return this.repo.save(existing);
    }

    return this.repo.save(
      this.repo.create({ ...data, sourceUrls: [sourceUrl] }),
    );
  }
}
```

- [x] **Step 4: Run typecheck**

Run: `cd museum-backend && pnpm lint`
Expected: 0 errors

- [x] **Step 5: Commit**

```bash
cd museum-backend && git add src/modules/knowledge-extraction/adapters/secondary/typeorm-*.ts
git commit -m "feat(knowledge-extraction): add TypeORM repos with upsert + partial merge logic"
```

---

### Task 15: Extraction Job Service

**Files:**
- Create: `src/modules/knowledge-extraction/useCase/extraction-job.service.ts`
- Test: `tests/unit/knowledge-extraction/extraction-job.test.ts`

- [x] **Step 1: Write the failing test**

```typescript
// tests/unit/knowledge-extraction/extraction-job.test.ts
import { ExtractionJobService } from '@modules/knowledge-extraction/useCase/extraction-job.service';
import { ExtractedContentStatus } from '@modules/knowledge-extraction/domain/extracted-content.entity';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

function makeMockScraper(result: { url: string; title: string; textContent: string; contentHash: string } | null) {
  return { scrape: jest.fn().mockResolvedValue(result) };
}

function makeMockClassifier(result: { type: string; confidence: number; data: unknown } | null) {
  return { classify: jest.fn().mockResolvedValue(result) };
}

function makeMockContentRepo(existing: { scrapedAt: Date } | null = null) {
  return {
    findByUrl: jest.fn().mockResolvedValue(existing),
    upsert: jest.fn().mockResolvedValue({ id: 'test-id' }),
    updateStatus: jest.fn().mockResolvedValue(undefined),
  };
}

function makeMockArtworkRepo() {
  return { upsertFromClassification: jest.fn().mockResolvedValue({ id: 'art-id' }) };
}

function makeMockMuseumRepo() {
  return { upsertFromClassification: jest.fn().mockResolvedValue({ id: 'museum-id' }) };
}

describe('ExtractionJobService', () => {
  const config = {
    confidenceThreshold: 0.7,
    reviewThreshold: 0.4,
    refetchAfterDays: 7,
  };

  it('scrapes, classifies, and stores artwork data', async () => {
    const scraper = makeMockScraper({
      url: 'https://example.com/mona-lisa',
      title: 'Mona Lisa',
      textContent: 'Leonardo da Vinci painted the Mona Lisa...',
      contentHash: 'hash123',
    });
    const classifier = makeMockClassifier({
      type: 'artwork',
      confidence: 0.9,
      data: {
        title: 'Mona Lisa',
        artist: 'Leonardo da Vinci',
        period: 'Renaissance',
        technique: 'Oil on panel',
        description: 'A famous portrait.',
        historicalContext: null,
        dimensions: '77x53cm',
        currentLocation: 'Louvre',
      },
    });
    const contentRepo = makeMockContentRepo();
    const artworkRepo = makeMockArtworkRepo();
    const museumRepo = makeMockMuseumRepo();

    const service = new ExtractionJobService(
      scraper, classifier, contentRepo, artworkRepo, museumRepo, config,
    );

    await service.processUrl('https://example.com/mona-lisa', 'mona lisa', 'en');

    expect(scraper.scrape).toHaveBeenCalledWith('https://example.com/mona-lisa');
    expect(classifier.classify).toHaveBeenCalled();
    expect(contentRepo.upsert).toHaveBeenCalled();
    expect(artworkRepo.upsertFromClassification).toHaveBeenCalled();
    expect(museumRepo.upsertFromClassification).not.toHaveBeenCalled();
  });

  it('skips recently scraped URLs', async () => {
    const scraper = makeMockScraper(null);
    const classifier = makeMockClassifier(null);
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 1); // 1 day ago
    const contentRepo = makeMockContentRepo({ scrapedAt: recentDate });
    const artworkRepo = makeMockArtworkRepo();
    const museumRepo = makeMockMuseumRepo();

    const service = new ExtractionJobService(
      scraper, classifier, contentRepo, artworkRepo, museumRepo, config,
    );

    await service.processUrl('https://example.com/cached', 'test', 'en');

    expect(scraper.scrape).not.toHaveBeenCalled();
  });

  it('re-scrapes stale URLs', async () => {
    const scraper = makeMockScraper({
      url: 'https://example.com/stale',
      title: 'Stale',
      textContent: 'Updated content...',
      contentHash: 'newhash',
    });
    const classifier = makeMockClassifier({
      type: 'irrelevant', confidence: 0.8, data: null,
    });
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 10); // 10 days ago
    const contentRepo = makeMockContentRepo({ scrapedAt: staleDate });
    const artworkRepo = makeMockArtworkRepo();
    const museumRepo = makeMockMuseumRepo();

    const service = new ExtractionJobService(
      scraper, classifier, contentRepo, artworkRepo, museumRepo, config,
    );

    await service.processUrl('https://example.com/stale', 'test', 'en');

    expect(scraper.scrape).toHaveBeenCalled();
  });

  it('handles scraper failure gracefully', async () => {
    const scraper = makeMockScraper(null);
    const classifier = makeMockClassifier(null);
    const contentRepo = makeMockContentRepo();
    const artworkRepo = makeMockArtworkRepo();
    const museumRepo = makeMockMuseumRepo();

    const service = new ExtractionJobService(
      scraper, classifier, contentRepo, artworkRepo, museumRepo, config,
    );

    // Should not throw
    await service.processUrl('https://example.com/failing', 'test', 'en');
    expect(classifier.classify).not.toHaveBeenCalled();
  });

  it('stores low-confidence results with needsReview flag', async () => {
    const scraper = makeMockScraper({
      url: 'https://example.com/ambiguous',
      title: 'Maybe Art',
      textContent: 'Some content...',
      contentHash: 'hash',
    });
    const classifier = makeMockClassifier({
      type: 'artwork',
      confidence: 0.5,
      data: {
        title: 'Maybe Art',
        artist: null,
        period: null,
        technique: null,
        description: 'Ambiguous description.',
        historicalContext: null,
        dimensions: null,
        currentLocation: null,
      },
    });
    const contentRepo = makeMockContentRepo();
    const artworkRepo = makeMockArtworkRepo();
    const museumRepo = makeMockMuseumRepo();

    const service = new ExtractionJobService(
      scraper, classifier, contentRepo, artworkRepo, museumRepo, config,
    );

    await service.processUrl('https://example.com/ambiguous', 'test', 'en');

    expect(artworkRepo.upsertFromClassification).toHaveBeenCalledWith(
      expect.objectContaining({ needsReview: true }),
      'https://example.com/ambiguous',
    );
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd museum-backend && pnpm test -- --testPathPattern=tests/unit/knowledge-extraction/extraction-job`
Expected: FAIL — module not found

- [x] **Step 3: Write the implementation**

```typescript
// src/modules/knowledge-extraction/useCase/extraction-job.service.ts
import { logger } from '@shared/logger/logger';

import { ExtractedContentStatus } from '../domain/extracted-content.entity';

import type { ScraperPort } from '../domain/ports/scraper.port';
import type { ContentClassifierPort } from '../domain/ports/content-classifier.port';
import type { TypeOrmExtractedContentRepo } from '../adapters/secondary/typeorm-extracted-content.repo';
import type { TypeOrmArtworkKnowledgeRepo } from '../adapters/secondary/typeorm-artwork-knowledge.repo';
import type { TypeOrmMuseumEnrichmentRepo } from '../adapters/secondary/typeorm-museum-enrichment.repo';

interface ExtractionJobConfig {
  confidenceThreshold: number;
  reviewThreshold: number;
  refetchAfterDays: number;
}

/**
 * Orchestrates the full extraction pipeline for a single URL:
 * dedup check → scrape → classify → store.
 */
export class ExtractionJobService {
  constructor(
    private readonly scraper: ScraperPort,
    private readonly classifier: ContentClassifierPort,
    private readonly contentRepo: TypeOrmExtractedContentRepo,
    private readonly artworkRepo: TypeOrmArtworkKnowledgeRepo,
    private readonly museumRepo: TypeOrmMuseumEnrichmentRepo,
    private readonly config: ExtractionJobConfig,
  ) {}

  async processUrl(
    url: string,
    searchTerm: string,
    locale: string,
  ): Promise<void> {
    try {
      // 1. Dedup check
      const existing = await this.contentRepo.findByUrl(url);
      if (existing) {
        const ageMs = Date.now() - existing.scrapedAt.getTime();
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        if (ageDays < this.config.refetchAfterDays) {
          logger.info('extraction_skip_recent', { url, ageDays: Math.round(ageDays) });
          return;
        }
        logger.info('extraction_refetch_stale', { url, ageDays: Math.round(ageDays) });
      }

      // 2. Scrape
      const page = await this.scraper.scrape(url);
      if (!page) {
        logger.warn('extraction_scrape_failed', { url });
        return;
      }

      // 3. Store raw content
      await this.contentRepo.upsert({
        url: page.url,
        title: page.title,
        textContent: page.textContent,
        contentHash: page.contentHash,
        status: ExtractedContentStatus.SCRAPED,
      });

      // 4. Classify
      const classification = await this.classifier.classify(page.textContent, locale);
      if (!classification) {
        await this.contentRepo.updateStatus(url, ExtractedContentStatus.FAILED);
        logger.warn('extraction_classify_failed', { url });
        return;
      }

      // 5. Store based on type and confidence
      if (classification.confidence < this.config.reviewThreshold) {
        await this.contentRepo.updateStatus(url, ExtractedContentStatus.LOW_CONFIDENCE);
        logger.info('extraction_low_confidence', {
          url,
          type: classification.type,
          confidence: classification.confidence,
        });
        return;
      }

      const needsReview = classification.confidence < this.config.confidenceThreshold;

      if (classification.type === 'artwork' && classification.data) {
        await this.artworkRepo.upsertFromClassification(
          {
            ...classification.data,
            sourceUrls: [url],
            confidence: classification.confidence,
            needsReview,
            locale,
          },
          url,
        );
      } else if (classification.type === 'museum' && classification.data) {
        await this.museumRepo.upsertFromClassification(
          {
            ...classification.data,
            museumId: null,
            sourceUrls: [url],
            confidence: classification.confidence,
            needsReview,
            locale,
          },
          url,
        );
      }

      await this.contentRepo.updateStatus(url, ExtractedContentStatus.CLASSIFIED);
      logger.info('extraction_success', {
        url,
        type: classification.type,
        confidence: classification.confidence,
        needsReview,
      });
    } catch (err) {
      logger.error('extraction_job_error', {
        url,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd museum-backend && pnpm test -- --testPathPattern=tests/unit/knowledge-extraction/extraction-job`
Expected: PASS (all 5 tests)

- [x] **Step 5: Commit**

```bash
cd museum-backend && git add src/modules/knowledge-extraction/useCase/extraction-job.service.ts tests/unit/knowledge-extraction/extraction-job.test.ts
git commit -m "feat(knowledge-extraction): add extraction job service (scrape→classify→store)"
```

---

### Task 16: BullMQ Worker + Queue

**Files:**
- Create: `src/modules/knowledge-extraction/adapters/primary/extraction.worker.ts`

- [x] **Step 1: Write the implementation**

```typescript
// src/modules/knowledge-extraction/adapters/primary/extraction.worker.ts
import { Queue, Worker } from 'bullmq';

import { logger } from '@shared/logger/logger';

import type { ExtractionJobPayload, ExtractionQueuePort } from '../../domain/ports/extraction-queue.port';
import type { ExtractionJobService } from '../../useCase/extraction-job.service';

const QUEUE_NAME = 'knowledge-extraction';

interface ExtractionWorkerConfig {
  concurrency: number;
  rateLimitMax: number;
  connection: { host: string; port: number; password?: string };
}

/**
 * BullMQ-based extraction queue and worker.
 *
 * Implements {@link ExtractionQueuePort} for enqueuing URLs (fire-and-forget)
 * and runs a worker that processes jobs via {@link ExtractionJobService}.
 */
export class ExtractionWorker implements ExtractionQueuePort {
  private readonly queue: Queue<ExtractionJobPayload>;
  private worker?: Worker<ExtractionJobPayload>;

  constructor(
    private readonly jobService: ExtractionJobService,
    private readonly config: ExtractionWorkerConfig,
  ) {
    this.queue = new Queue(QUEUE_NAME, {
      connection: this.config.connection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 500,
        attempts: 2,
        backoff: { type: 'exponential', delay: 30_000 },
      },
    });
  }

  /** Starts the worker. Call once at app startup. */
  start(): void {
    this.worker = new Worker<ExtractionJobPayload>(
      QUEUE_NAME,
      async (job) => {
        const { url, searchTerm, locale } = job.data;
        logger.info('extraction_job_start', { url, jobId: job.id });
        await this.jobService.processUrl(url, searchTerm, locale);
      },
      {
        connection: this.config.connection,
        concurrency: this.config.concurrency,
        limiter: {
          max: this.config.rateLimitMax,
          duration: 60_000,
        },
      },
    );

    this.worker.on('completed', (job) => {
      logger.info('extraction_job_completed', { jobId: job.id, url: job.data.url });
    });

    this.worker.on('failed', (job, err) => {
      logger.warn('extraction_job_failed', {
        jobId: job?.id,
        url: job?.data.url,
        error: err.message,
      });
    });

    logger.info('extraction_worker_started', {
      concurrency: this.config.concurrency,
      rateLimitMax: this.config.rateLimitMax,
    });
  }

  /** Enqueues URLs for background extraction. Fire-and-forget. */
  async enqueueUrls(jobs: ExtractionJobPayload[]): Promise<void> {
    try {
      await this.queue.addBulk(
        jobs.map((payload) => ({
          name: 'extract',
          data: payload,
          opts: {
            jobId: `extract:${payload.url}`,
          },
        })),
      );
      logger.info('extraction_urls_enqueued', { count: jobs.length });
    } catch (err) {
      // Fire-and-forget: never block the chat pipeline
      logger.warn('extraction_enqueue_error', {
        error: err instanceof Error ? err.message : String(err),
        count: jobs.length,
      });
    }
  }

  /** Graceful shutdown. */
  async close(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
  }
}
```

- [x] **Step 2: Run typecheck**

Run: `cd museum-backend && pnpm lint`
Expected: 0 errors

- [x] **Step 3: Commit**

```bash
cd museum-backend && git add src/modules/knowledge-extraction/adapters/primary/extraction.worker.ts
git commit -m "feat(knowledge-extraction): add BullMQ extraction worker with rate limiting"
```

---

### Task 17: DB Lookup Service + Prompt Builder

**Files:**
- Create: `src/modules/knowledge-extraction/useCase/db-lookup.service.ts`
- Create: `src/modules/knowledge-extraction/useCase/db-lookup.prompt.ts`
- Test: `tests/unit/knowledge-extraction/db-lookup.test.ts`

- [x] **Step 1: Write the failing test**

```typescript
// tests/unit/knowledge-extraction/db-lookup.test.ts
import { DbLookupService } from '@modules/knowledge-extraction/useCase/db-lookup.service';
import { makeArtworkKnowledge, makeMuseumEnrichment } from '../../helpers/knowledge-extraction/extraction.fixtures';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

function makeMockArtworkRepo(results: ReturnType<typeof makeArtworkKnowledge>[]) {
  return { searchByTitle: jest.fn().mockResolvedValue(results) };
}

function makeMockMuseumRepo(results: ReturnType<typeof makeMuseumEnrichment>[]) {
  return { searchByName: jest.fn().mockResolvedValue(results) };
}

describe('DbLookupService', () => {
  it('returns formatted block when artwork found', async () => {
    const artwork = makeArtworkKnowledge({ title: 'Mona Lisa', artist: 'Da Vinci' });
    const service = new DbLookupService(
      makeMockArtworkRepo([artwork]) as never,
      makeMockMuseumRepo([]) as never,
    );

    const block = await service.lookup('Mona Lisa', 'en');

    expect(block).toContain('[LOCAL KNOWLEDGE');
    expect(block).toContain('Mona Lisa');
    expect(block).toContain('Da Vinci');
  });

  it('returns formatted block when museum found', async () => {
    const museum = makeMuseumEnrichment({ name: 'Louvre Museum', website: 'https://louvre.fr' });
    const service = new DbLookupService(
      makeMockArtworkRepo([]) as never,
      makeMockMuseumRepo([museum]) as never,
    );

    const block = await service.lookup('Louvre', 'en');

    expect(block).toContain('[LOCAL KNOWLEDGE');
    expect(block).toContain('Louvre Museum');
  });

  it('returns empty string when nothing found', async () => {
    const service = new DbLookupService(
      makeMockArtworkRepo([]) as never,
      makeMockMuseumRepo([]) as never,
    );

    const block = await service.lookup('Unknown Topic', 'en');
    expect(block).toBe('');
  });

  it('returns empty string on null search term', async () => {
    const service = new DbLookupService(
      makeMockArtworkRepo([]) as never,
      makeMockMuseumRepo([]) as never,
    );

    const block = await service.lookup('', 'en');
    expect(block).toBe('');
  });

  it('handles repo error gracefully (fail-open)', async () => {
    const service = new DbLookupService(
      { searchByTitle: jest.fn().mockRejectedValue(new Error('DB down')) } as never,
      makeMockMuseumRepo([]) as never,
    );

    const block = await service.lookup('test', 'en');
    expect(block).toBe('');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd museum-backend && pnpm test -- --testPathPattern=tests/unit/knowledge-extraction/db-lookup`
Expected: FAIL — module not found

- [x] **Step 3: Write the prompt builder**

```typescript
// src/modules/knowledge-extraction/useCase/db-lookup.prompt.ts
import { sanitizePromptInput } from '@shared/validation/input';

import type { ArtworkKnowledge } from '../domain/artwork-knowledge.entity';
import type { MuseumEnrichment } from '../domain/museum-enrichment.entity';

const MAX_BLOCK_LENGTH = 1500;

/**
 * Builds a `[LOCAL KNOWLEDGE]` prompt block from DB-stored artwork
 * and museum data. Returns empty string if no data available.
 */
export function buildLocalKnowledgeBlock(
  artworks: ArtworkKnowledge[],
  museums: MuseumEnrichment[],
): string {
  if (artworks.length === 0 && museums.length === 0) return '';

  const lines: string[] = [
    '[LOCAL KNOWLEDGE — verified data from our database]',
  ];

  for (const art of artworks.slice(0, 3)) {
    lines.push(`\nArtwork: "${sanitizePromptInput(art.title, 200)}"`);
    if (art.artist) lines.push(`  Artist: ${sanitizePromptInput(art.artist, 100)}`);
    if (art.period) lines.push(`  Period: ${sanitizePromptInput(art.period, 100)}`);
    if (art.technique) lines.push(`  Technique: ${sanitizePromptInput(art.technique, 100)}`);
    if (art.dimensions) lines.push(`  Dimensions: ${sanitizePromptInput(art.dimensions, 50)}`);
    if (art.currentLocation) lines.push(`  Location: ${sanitizePromptInput(art.currentLocation, 150)}`);
    lines.push(`  ${sanitizePromptInput(art.description, 400)}`);
    if (art.historicalContext) {
      lines.push(`  Context: ${sanitizePromptInput(art.historicalContext, 300)}`);
    }
  }

  for (const museum of museums.slice(0, 2)) {
    lines.push(`\nMuseum: "${sanitizePromptInput(museum.name, 200)}"`);
    if (museum.website) lines.push(`  Website: ${museum.website}`);
    if (museum.openingHours) lines.push(`  Hours: ${JSON.stringify(museum.openingHours)}`);
    if (museum.admissionFees) lines.push(`  Fees: ${JSON.stringify(museum.admissionFees)}`);
    if (museum.collections) lines.push(`  Collections: ${JSON.stringify(museum.collections)}`);
  }

  lines.push(
    '\nPrioritize this verified data over web search results. Cite as established facts.',
  );

  const block = lines.join('\n');
  return block.length > MAX_BLOCK_LENGTH
    ? block.slice(0, MAX_BLOCK_LENGTH - 3) + '...'
    : block;
}
```

- [x] **Step 4: Write the service**

```typescript
// src/modules/knowledge-extraction/useCase/db-lookup.service.ts
import { logger } from '@shared/logger/logger';

import { buildLocalKnowledgeBlock } from './db-lookup.prompt';

import type { TypeOrmArtworkKnowledgeRepo } from '../adapters/secondary/typeorm-artwork-knowledge.repo';
import type { TypeOrmMuseumEnrichmentRepo } from '../adapters/secondary/typeorm-museum-enrichment.repo';

/**
 * Queries the local knowledge DB for artwork/museum data.
 * Used as a 6th enrichment source in the chat pipeline.
 * Fail-open: returns empty string on any error.
 */
export class DbLookupService {
  constructor(
    private readonly artworkRepo: TypeOrmArtworkKnowledgeRepo,
    private readonly museumRepo: TypeOrmMuseumEnrichmentRepo,
  ) {}

  async lookup(searchTerm: string, locale: string): Promise<string> {
    if (!searchTerm.trim()) return '';

    try {
      const [artworks, museums] = await Promise.all([
        this.artworkRepo.searchByTitle(searchTerm, locale),
        this.museumRepo.searchByName(searchTerm, locale),
      ]);

      const block = buildLocalKnowledgeBlock(artworks, museums);

      if (block) {
        logger.info('db_lookup_hit', {
          searchTerm,
          artworks: artworks.length,
          museums: museums.length,
        });
      }

      return block;
    } catch (err) {
      logger.warn('db_lookup_error', {
        searchTerm,
        error: err instanceof Error ? err.message : String(err),
      });
      return '';
    }
  }
}
```

- [x] **Step 5: Run test to verify it passes**

Run: `cd museum-backend && pnpm test -- --testPathPattern=tests/unit/knowledge-extraction/db-lookup`
Expected: PASS (all 5 tests)

- [x] **Step 6: Commit**

```bash
cd museum-backend && git add src/modules/knowledge-extraction/useCase/db-lookup.service.ts src/modules/knowledge-extraction/useCase/db-lookup.prompt.ts tests/unit/knowledge-extraction/db-lookup.test.ts
git commit -m "feat(knowledge-extraction): add DB lookup service with LOCAL KNOWLEDGE prompt block"
```

---

### Task 18: Enrichment Loop Integration

**Files:**
- Modify: `src/modules/chat/useCase/enrichment-fetcher.ts`
- Modify: `src/modules/chat/useCase/llm-prompt-builder.ts`
- Modify: `src/modules/chat/useCase/chat-message.service.ts`
- Modify: `src/modules/chat/adapters/secondary/langchain.orchestrator.ts`

- [x] **Step 1: Update EnrichmentDeps in enrichment-fetcher.ts**

Add the two new dependencies to the `EnrichmentDeps` interface:

```typescript
import type { DbLookupService } from '@modules/knowledge-extraction/useCase/db-lookup.service';
import type { ExtractionQueuePort } from '@modules/knowledge-extraction/domain/ports/extraction-queue.port';

interface EnrichmentDeps {
  userMemory?: UserMemoryService;
  knowledgeBase?: KnowledgeBaseService;
  imageEnrichment?: ImageEnrichmentService;
  webSearch?: WebSearchService;
  dbLookup?: DbLookupService;
  extractionQueue?: ExtractionQueuePort;
}
```

- [x] **Step 2: Add `locale` parameter + 6th parallel source + URL enqueue**

Add `locale: string` as a new parameter to `fetchEnrichmentData()`:

```typescript
export async function fetchEnrichmentData(
  deps: EnrichmentDeps,
  history: { role: string; metadata?: Record<string, unknown> | null }[],
  inputText: string | undefined,
  ownerId: number | undefined,
  locale: string,
): Promise<{
  userMemoryBlock: string;
  knowledgeBaseBlock: string;
  webSearchBlock: string;
  localKnowledgeBlock: string;
  enrichedImages: EnrichedImage[];
  webSearchResults: SearchResult[];
}>
```

The caller (`chat-message.service.ts`) already has `locale` available — pass it through.

Add `webSearchResults` to the return so the caller can enqueue URLs. Change `fetchWebSearch` to call `searchRaw()` instead of `search()`, and format the block separately:

```typescript
async function fetchWebSearchRaw(
  deps: EnrichmentDeps,
  searchTerm: string | null,
): Promise<SearchResult[] | undefined> {
  if (!deps.webSearch || !searchTerm) return undefined;
  return failOpen(deps.webSearch.searchRaw(searchTerm));
}
```

In the `Promise.all`, replace `fetchWebSearch` with `fetchWebSearchRaw`, and after the await, format the block:

```typescript
const webSearchBlock = buildWebSearchPromptBlock(webRaw ?? []);
```

Return `webSearchResults: webRaw ?? []` so the caller can enqueue.

Add a new fetch function:

```typescript
function fetchLocalKnowledge(
  deps: EnrichmentDeps,
  searchTerm: string | null,
  locale: string,
): Promise<string | undefined> {
  if (!deps.dbLookup || !searchTerm) return NONE;
  return failOpen(deps.dbLookup.lookup(searchTerm, locale));
}
```

Update the `Promise.all` to include 6 sources:

```typescript
const [memory, kb, kbFacts, images, web, localKnowledge] = await Promise.all([
  fetchMemory(deps, ownerId),
  fetchKnowledgeBase(deps, searchTerm),
  fetchKbFacts(deps, searchTerm),
  fetchImages(deps, searchTerm),
  fetchWebSearch(deps, searchTerm),
  fetchLocalKnowledge(deps, searchTerm, locale),
]);
```

Add `localKnowledgeBlock` to the return value:

```typescript
return {
  userMemoryBlock: memory ?? '',
  knowledgeBaseBlock: kb ?? '',
  webSearchBlock: web ?? '',
  localKnowledgeBlock: localKnowledge ?? '',
  enrichedImages,
};
```

The URL enqueue is handled in `chat-message.service.ts` (Step 4) — not in the fetcher — to keep the fetcher side-effect-free.

- [x] **Step 3: Update llm-prompt-builder.ts**

Add `localKnowledgeBlock` to the options type and inject it as the first enrichment SystemMessage (highest priority):

```typescript
export const buildSectionMessages = (
  systemPrompt: string,
  sectionPrompt: string,
  historyMessages: ChatModelMessage[],
  userMessage: HumanMessage,
  options?: {
    userMemoryBlock?: string;
    knowledgeBaseBlock?: string;
    webSearchBlock?: string;
    localKnowledgeBlock?: string;
  },
): ChatModelMessage[] => {
  const { userMemoryBlock, knowledgeBaseBlock, webSearchBlock, localKnowledgeBlock } = options ?? {};
  const messages: ChatModelMessage[] = [
    new SystemMessage(systemPrompt),
    new SystemMessage(sectionPrompt),
  ];

  // Priority order: local knowledge (verified) → knowledge base → web search → memory
  if (localKnowledgeBlock) {
    messages.push(new SystemMessage(localKnowledgeBlock));
  }

  if (knowledgeBaseBlock) {
    messages.push(new SystemMessage(knowledgeBaseBlock));
  }

  if (webSearchBlock) {
    messages.push(new SystemMessage(webSearchBlock));
  }

  if (userMemoryBlock) {
    messages.push(new SystemMessage(userMemoryBlock));
  }

  messages.push(...historyMessages, userMessage);
  // ... rest unchanged
```

- [x] **Step 4: Update chat-message.service.ts**

Add `dbLookup` and `extractionQueue` to `ChatMessageServiceDeps`:

```typescript
import type { DbLookupService } from '@modules/knowledge-extraction/useCase/db-lookup.service';
import type { ExtractionQueuePort } from '@modules/knowledge-extraction/domain/ports/extraction-queue.port';

export interface ChatMessageServiceDeps {
  // ... existing deps ...
  dbLookup?: DbLookupService;
  extractionQueue?: ExtractionQueuePort;
}
```

In the constructor, assign them:

```typescript
private readonly dbLookup?: DbLookupService;
private readonly extractionQueue?: ExtractionQueuePort;

constructor(deps: ChatMessageServiceDeps) {
  // ... existing assignments ...
  this.dbLookup = deps.dbLookup;
  this.extractionQueue = deps.extractionQueue;
}
```

Where `fetchEnrichmentData` is called, pass the new deps, locale, and destructure all fields:

```typescript
const {
  userMemoryBlock, knowledgeBaseBlock, webSearchBlock,
  localKnowledgeBlock, enrichedImages, webSearchResults,
} = await fetchEnrichmentData(
    {
      userMemory: this.userMemory,
      knowledgeBase: this.knowledgeBase,
      imageEnrichment: this.imageEnrichment,
      webSearch: this.webSearch,
      dbLookup: this.dbLookup,
    },
    history,
    input.text?.trim(),
    ownerId,
    requestedLocale,
  );

// Fire-and-forget: enqueue web search URLs for background extraction
if (this.extractionQueue && webSearchResults.length > 0) {
  const searchTerm = extractSearchTerm(history, input.text?.trim());
  if (searchTerm) {
    void this.extractionQueue.enqueueUrls(
      webSearchResults.slice(0, 5).map((r) => ({
        url: r.url,
        searchTerm,
        locale: requestedLocale,
      })),
    );
  }
}
```

Pass `localKnowledgeBlock` to the orchestrator alongside the other blocks.

- [x] **Step 5: Update langchain.orchestrator.ts**

Add `localKnowledgeBlock` to `OrchestratorInput` and pass it to `buildSectionMessages`:

In the input type, add:

```typescript
localKnowledgeBlock?: string;
```

Where `buildSectionMessages` is called, include it:

```typescript
const messages = buildSectionMessages(
  systemPrompt,
  sectionPrompt,
  historyMessages,
  userMessage,
  {
    userMemoryBlock: input.userMemoryBlock,
    knowledgeBaseBlock: input.knowledgeBaseBlock,
    webSearchBlock: input.webSearchBlock,
    localKnowledgeBlock: input.localKnowledgeBlock,
  },
);
```

- [x] **Step 6: Run typecheck + existing tests**

Run: `cd museum-backend && pnpm lint && pnpm test`
Expected: 0 errors, all tests pass

- [x] **Step 7: Commit**

```bash
cd museum-backend && git add src/modules/chat/useCase/enrichment-fetcher.ts src/modules/chat/useCase/llm-prompt-builder.ts src/modules/chat/useCase/chat-message.service.ts src/modules/chat/adapters/secondary/langchain.orchestrator.ts
git commit -m "feat(knowledge-extraction): integrate DB lookup as 6th enrichment source + URL enqueue"
```

---

### Task 19: Knowledge Extraction Module Wiring + Env Config

**Files:**
- Create: `src/modules/knowledge-extraction/index.ts`
- Modify: `src/config/env.ts`
- Modify: `src/config/env.types.ts`
- Modify: `src/modules/chat/index.ts`

- [x] **Step 1: Add extraction config to env.types.ts**

```typescript
extraction: {
  queueConcurrency: number;
  queueRateLimit: number;
  scrapeTimeoutMs: number;
  contentMaxBytes: number;
  refetchAfterDays: number;
  llmModel: string;
  confidenceThreshold: number;
  reviewThreshold: number;
};
```

- [x] **Step 2: Add extraction config to env.ts**

```typescript
extraction: {
  queueConcurrency: toNumber(process.env.EXTRACTION_QUEUE_CONCURRENCY, 2),
  queueRateLimit: toNumber(process.env.EXTRACTION_QUEUE_RATE_LIMIT, 60),
  scrapeTimeoutMs: toNumber(process.env.EXTRACTION_SCRAPE_TIMEOUT_MS, 5000),
  contentMaxBytes: toNumber(process.env.EXTRACTION_CONTENT_MAX_BYTES, 51200),
  refetchAfterDays: toNumber(process.env.EXTRACTION_REFETCH_AFTER_DAYS, 7),
  llmModel: process.env.EXTRACTION_LLM_MODEL ?? 'gpt-4o-mini',
  confidenceThreshold: toNumber(process.env.EXTRACTION_CONFIDENCE_THRESHOLD, 0.7),
  reviewThreshold: toNumber(process.env.EXTRACTION_REVIEW_THRESHOLD, 0.4),
},
```

Add a new feature flag:

```typescript
featureFlags: {
  // ... existing flags ...
  knowledgeExtraction: toBoolean(process.env.FEATURE_FLAG_KNOWLEDGE_EXTRACTION, false),
},
```

- [x] **Step 3: Create module wiring (index.ts)**

```typescript
// src/modules/knowledge-extraction/index.ts
import type { DataSource } from 'typeorm';

import { env } from '@src/config/env';
import { logger } from '@shared/logger/logger';
import type { CacheService } from '@shared/cache/cache.port';

import { ExtractedContent } from './domain/extracted-content.entity';
import { ArtworkKnowledge } from './domain/artwork-knowledge.entity';
import { MuseumEnrichment } from './domain/museum-enrichment.entity';

import { TypeOrmExtractedContentRepo } from './adapters/secondary/typeorm-extracted-content.repo';
import { TypeOrmArtworkKnowledgeRepo } from './adapters/secondary/typeorm-artwork-knowledge.repo';
import { TypeOrmMuseumEnrichmentRepo } from './adapters/secondary/typeorm-museum-enrichment.repo';
import { HtmlScraper } from './adapters/secondary/html-scraper';
import { ContentClassifierService } from './useCase/content-classifier.service';
import { ExtractionJobService } from './useCase/extraction-job.service';
import { ExtractionWorker } from './adapters/primary/extraction.worker';
import { DbLookupService } from './useCase/db-lookup.service';

import type { ExtractionQueuePort } from './domain/ports/extraction-queue.port';

export interface BuiltKnowledgeExtractionModule {
  dbLookup: DbLookupService;
  extractionQueue?: ExtractionQueuePort;
  /** Call to gracefully shut down the worker. */
  close: () => Promise<void>;
}

export class KnowledgeExtractionModule {
  build(dataSource: DataSource): BuiltKnowledgeExtractionModule {
    const contentRepo = new TypeOrmExtractedContentRepo(
      dataSource.getRepository(ExtractedContent),
    );
    const artworkRepo = new TypeOrmArtworkKnowledgeRepo(
      dataSource.getRepository(ArtworkKnowledge),
    );
    const museumRepo = new TypeOrmMuseumEnrichmentRepo(
      dataSource.getRepository(MuseumEnrichment),
    );

    const dbLookup = new DbLookupService(artworkRepo, museumRepo);

    // If extraction pipeline is disabled, return only the DB lookup
    if (!env.featureFlags.knowledgeExtraction) {
      logger.info('knowledge_extraction_disabled');
      return { dbLookup, close: async () => {} };
    }

    const openaiKey = env.llm.openaiApiKey;
    if (!openaiKey) {
      logger.warn('knowledge_extraction_no_openai_key', {
        reason: 'OPENAI_API_KEY required for content classification',
      });
      return { dbLookup, close: async () => {} };
    }

    const scraper = new HtmlScraper({
      timeoutMs: env.extraction.scrapeTimeoutMs,
      maxContentBytes: env.extraction.contentMaxBytes,
    });

    const classifier = new ContentClassifierService(
      openaiKey,
      env.extraction.llmModel,
    );

    const jobService = new ExtractionJobService(
      scraper,
      classifier,
      contentRepo,
      artworkRepo,
      museumRepo,
      {
        confidenceThreshold: env.extraction.confidenceThreshold,
        reviewThreshold: env.extraction.reviewThreshold,
        refetchAfterDays: env.extraction.refetchAfterDays,
      },
    );

    const redisConfig = {
      host: env.redis.host,
      port: env.redis.port,
      password: env.redis.password,
    };

    const worker = new ExtractionWorker(jobService, {
      concurrency: env.extraction.queueConcurrency,
      rateLimitMax: env.extraction.queueRateLimit,
      connection: redisConfig,
    });

    worker.start();

    logger.info('knowledge_extraction_started', {
      llmModel: env.extraction.llmModel,
      concurrency: env.extraction.queueConcurrency,
    });

    return {
      dbLookup,
      extractionQueue: worker,
      close: () => worker.close(),
    };
  }
}
```

- [x] **Step 4: Wire into chat/index.ts**

In `ChatModule.build()`, after building web search, build the knowledge extraction module and pass its services to `ChatMessageService`:

```typescript
import { KnowledgeExtractionModule } from '@modules/knowledge-extraction/index';

// Inside build():
const knowledgeExtraction = new KnowledgeExtractionModule().build(dataSource);

const chatService = new ChatMessageService({
  // ... existing deps ...
  dbLookup: knowledgeExtraction.dbLookup,
  extractionQueue: knowledgeExtraction.extractionQueue,
});
```

Add `close` to the module's return type so it can be called on shutdown.

- [x] **Step 5: Run typecheck**

Run: `cd museum-backend && pnpm lint`
Expected: 0 errors

- [x] **Step 6: Run full test suite**

Run: `cd museum-backend && pnpm test`
Expected: ALL PASS

- [x] **Step 7: Commit**

```bash
cd museum-backend && git add src/modules/knowledge-extraction/index.ts src/config/env.ts src/config/env.types.ts src/modules/chat/index.ts
git commit -m "feat(knowledge-extraction): wire module with BullMQ worker, DB lookup, and chat integration"
```

---

### Task 20: Final Verification

- [x] **Step 1: Run full typecheck**

Run: `cd museum-backend && pnpm lint`
Expected: 0 errors

- [x] **Step 2: Run full test suite**

Run: `cd museum-backend && pnpm test`
Expected: ALL PASS, count should be previous (2457) + new tests (~30)

- [x] **Step 3: Update .env.local.example with new env vars**

Add the new provider keys and extraction config as commented examples.

- [x] **Step 4: Verify DB migration on clean state**

Run:
```bash
cd museum-backend && pnpm migration:revert && pnpm migration:revert && pnpm migration:revert && pnpm migration:run
```
Expected: all migrations apply cleanly

- [x] **Step 5: Run drift check**

Run: `cd museum-backend && node scripts/migration-cli.cjs generate --name=DriftCheck`
Expected: empty migration (no drift). Delete the empty file.

- [x] **Step 6: Final commit**

```bash
cd museum-backend && git add .
git commit -m "feat: complete multi-provider web search + knowledge extraction pipeline"
```
