import { DuckDuckGoClient } from '@modules/chat/adapters/secondary/search/duckduckgo.client';
import { mockFetch } from '../../helpers/fetch/fetch-mock.helpers';
import {
  makeDuckDuckGoApiResponse,
  makeDuckDuckGoRelatedTopic,
} from '../../helpers/search-clients/duckduckgo.fixture';

// Silence logger
jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { logger } from '@shared/logger/logger';

const originalFetch = global.fetch;

describe('DuckDuckGoClient', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  // UC-DD-01 — Abstract normalized into a SearchResult
  it('returns a SearchResult built from the Instant Answer abstract', async () => {
    global.fetch = mockFetch({
      body: makeDuckDuckGoApiResponse({
        Heading: 'Renoir',
        AbstractText: 'Pierre-Auguste Renoir was a French painter.',
        AbstractURL: 'https://duckduckgo.com/Pierre-Auguste_Renoir',
        RelatedTopics: [],
      }),
    });

    const client = new DuckDuckGoClient();
    const results = await client.search({ query: 'Renoir' });

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.url).toBe('https://duckduckgo.com/Pierre-Auguste_Renoir');
    expect(results[0]!.snippet).toBe('Pierre-Auguste Renoir was a French painter.');
  });

  // UC-DD-02 — RelatedTopics with FirstURL+Text mapped
  it('maps RelatedTopics entries that carry FirstURL and Text', async () => {
    global.fetch = mockFetch({
      body: makeDuckDuckGoApiResponse({
        AbstractText: '',
        AbstractURL: '',
        RelatedTopics: [
          makeDuckDuckGoRelatedTopic({ FirstURL: 'https://ddg.example/1', Text: 'Topic one' }),
          makeDuckDuckGoRelatedTopic({ FirstURL: 'https://ddg.example/2', Text: 'Topic two' }),
          makeDuckDuckGoRelatedTopic({ FirstURL: 'https://ddg.example/3', Text: 'Topic three' }),
        ],
      }),
    });

    const client = new DuckDuckGoClient();
    const results = await client.search({ query: 'q' });

    const urls = results.map((r) => r.url);
    expect(urls).toEqual(
      expect.arrayContaining([
        'https://ddg.example/1',
        'https://ddg.example/2',
        'https://ddg.example/3',
      ]),
    );
  });

  // UC-DD-03 — request URL shape
  it('builds the api.duckduckgo.com URL with q, format and no_html params', async () => {
    const fetchSpy = mockFetch({
      body: makeDuckDuckGoApiResponse({ AbstractText: '', AbstractURL: '' }),
    });
    global.fetch = fetchSpy;

    const client = new DuckDuckGoClient();
    await client.search({ query: 'art Paris' });

    const callUrl = fetchSpy.mock.calls[0][0] as string;
    const url = new URL(callUrl);
    expect(url.origin + url.pathname).toBe('https://api.duckduckgo.com/');
    expect(url.searchParams.get('q')).toBe('art Paris');
    expect(url.searchParams.get('format')).toBe('json');
    expect(url.searchParams.get('no_html')).toBe('1');
  });

  // UC-DD-04 — non-ok status -> [] + warn
  it('returns empty array and warns on HTTP error response', async () => {
    global.fetch = mockFetch({ ok: false, status: 503 });

    const client = new DuckDuckGoClient();
    const results = await client.search({ query: 'q' });

    expect(results).toEqual([]);
    expect(logger.warn).toHaveBeenCalled();
  });

  // UC-DD-05 — thrown fetch -> [] (fail-open)
  it('returns empty array when fetch throws', async () => {
    global.fetch = mockFetch(new Error('network down'));

    const client = new DuckDuckGoClient();
    const results = await client.search({ query: 'q' });

    expect(results).toEqual([]);
  });

  // UC-DD-06 — no abstract, no related topics -> []
  it('returns empty array when the Instant Answer payload is empty', async () => {
    global.fetch = mockFetch({ body: {} });

    const client = new DuckDuckGoClient();
    const results = await client.search({ query: 'q' });

    expect(results).toEqual([]);
  });

  // UC-DD-07 — nested group (no FirstURL/Text) skipped -> [] (no throw)
  it('skips nested RelatedTopics groups that lack FirstURL/Text', async () => {
    global.fetch = mockFetch({
      body: makeDuckDuckGoApiResponse({
        AbstractText: '',
        AbstractURL: '',
        RelatedTopics: [
          {
            Name: 'category',
            Topics: [makeDuckDuckGoRelatedTopic({ FirstURL: 'https://ddg.example/nested' })],
          },
        ],
      }),
    });

    const client = new DuckDuckGoClient();
    const results = await client.search({ query: 'q' });

    expect(results).toEqual([]);
  });

  // UC-DD-08 — hard cap <= 10
  it('caps results at 10', async () => {
    const topics = Array.from({ length: 25 }, (_, i) =>
      makeDuckDuckGoRelatedTopic({ FirstURL: `https://ddg.example/${i}`, Text: `t${i}` }),
    );
    global.fetch = mockFetch({
      body: makeDuckDuckGoApiResponse({ AbstractText: '', AbstractURL: '', RelatedTopics: topics }),
    });

    const client = new DuckDuckGoClient();
    const results = await client.search({ query: 'q', maxResults: 50 });

    expect(results.length).toBeLessThanOrEqual(10);
  });

  // UC-DD-09 — empty/whitespace query -> [] with no fetch
  it('returns empty array for whitespace query without fetching', async () => {
    const fetchSpy = mockFetch({ body: makeDuckDuckGoApiResponse() });
    global.fetch = fetchSpy;

    const client = new DuckDuckGoClient();
    const results = await client.search({ query: ' ' });

    expect(results).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // UC-DD-10 — signal propagation
  it('propagates query.signal into fetch', async () => {
    const fetchSpy = mockFetch({
      body: makeDuckDuckGoApiResponse({ AbstractText: '', AbstractURL: '' }),
    });
    global.fetch = fetchSpy;

    const controller = new AbortController();
    const client = new DuckDuckGoClient();
    await client.search({ query: 'q', signal: controller.signal });

    const callArgs = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(callArgs[1].signal).toBe(controller.signal);
  });

  // INV-10 — readonly name
  it('exposes a stable readonly name', () => {
    const client = new DuckDuckGoClient();
    expect(client.name).toBe('duckduckgo');
  });
});
