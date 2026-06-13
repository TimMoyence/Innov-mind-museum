import { GoogleCseClient } from '@modules/chat/adapters/secondary/search/google-cse.client';
import { mockFetch } from '../../helpers/fetch/fetch-mock.helpers';
import {
  makeGoogleCseItem,
  makeGoogleCseApiResponse,
} from '../../helpers/search-clients/google-cse.fixture';

// Silence logger
jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { logger } from '@shared/logger/logger';

const originalFetch = global.fetch;

describe('GoogleCseClient', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  // UC-GC-01 — happy normalize
  it('returns normalized search results from a successful API response', async () => {
    global.fetch = mockFetch({
      body: makeGoogleCseApiResponse([
        makeGoogleCseItem({
          link: 'https://example.com/a',
          title: 'Result A',
          snippet: 'Snippet A',
        }),
        makeGoogleCseItem({
          link: 'https://example.com/b',
          title: 'Result B',
          snippet: 'Snippet B',
        }),
      ]),
    });

    const client = new GoogleCseClient({ apiKey: 'fake-api-key', cseId: 'fake-cx' });
    const results = await client.search({ query: 'art Paris' });

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      url: 'https://example.com/a',
      title: 'Result A',
      snippet: 'Snippet A',
    });
  });

  // UC-GC-02 — request URL params (key, cx, q, num)
  it('builds the customsearch URL with key, cx, q and num params', async () => {
    const fetchSpy = mockFetch({ body: makeGoogleCseApiResponse([]) });
    global.fetch = fetchSpy;

    const client = new GoogleCseClient({ apiKey: 'my-key', cseId: 'my-cx' });
    await client.search({ query: 'art Paris', maxResults: 3 });

    const callUrl = fetchSpy.mock.calls[0][0] as string;
    const url = new URL(callUrl);
    expect(url.origin + url.pathname).toBe('https://www.googleapis.com/customsearch/v1');
    expect(url.searchParams.get('key')).toBe('my-key');
    expect(url.searchParams.get('cx')).toBe('my-cx');
    expect(url.searchParams.get('q')).toBe('art Paris');
    expect(url.searchParams.get('num')).toBe('3');
  });

  // UC-GC-03 — non-ok status -> [] + warn
  it('returns empty array and warns on HTTP error response', async () => {
    global.fetch = mockFetch({ ok: false, status: 403 });

    const client = new GoogleCseClient({ apiKey: 'fake-api-key', cseId: 'fake-cx' });
    const results = await client.search({ query: 'q' });

    expect(results).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(
      'google_cse_search_http_error',
      expect.objectContaining({ status: 403 }),
    );
  });

  // UC-GC-04 — thrown fetch -> [] + warn (fail-open)
  it('returns empty array and warns when fetch throws', async () => {
    global.fetch = mockFetch(new Error('network down'));

    const client = new GoogleCseClient({ apiKey: 'fake-api-key', cseId: 'fake-cx' });
    const results = await client.search({ query: 'q' });

    expect(results).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(
      'google_cse_search_exception',
      expect.objectContaining({ query: 'q' }),
    );
  });

  // UC-GC-05 — missing items field graceful
  it('handles missing items field gracefully', async () => {
    global.fetch = mockFetch({ body: {} });

    const client = new GoogleCseClient({ apiKey: 'fake-api-key', cseId: 'fake-cx' });
    const results = await client.search({ query: 'q' });

    expect(results).toEqual([]);
  });

  // UC-GC-06 — garbage items (not an array)
  it('returns empty array when items is not an array (garbage body)', async () => {
    global.fetch = mockFetch({ body: { items: 'not-an-array' } });

    const client = new GoogleCseClient({ apiKey: 'fake-api-key', cseId: 'fake-cx' });
    const results = await client.search({ query: 'q' });

    expect(results).toEqual([]);
  });

  // UC-GC-07 — maxResults hard cap = 10
  it('caps num at 10', async () => {
    const fetchSpy = mockFetch({ body: makeGoogleCseApiResponse([]) });
    global.fetch = fetchSpy;

    const client = new GoogleCseClient({ apiKey: 'fake-api-key', cseId: 'fake-cx' });
    await client.search({ query: 'q', maxResults: 50 });

    const callUrl = fetchSpy.mock.calls[0][0] as string;
    const url = new URL(callUrl);
    expect(url.searchParams.get('num')).toBe('10');
  });

  // UC-GC-08 — default num = 5
  it('uses default 5 num when maxResults not specified', async () => {
    const fetchSpy = mockFetch({ body: makeGoogleCseApiResponse([]) });
    global.fetch = fetchSpy;

    const client = new GoogleCseClient({ apiKey: 'fake-api-key', cseId: 'fake-cx' });
    await client.search({ query: 'q' });

    const callUrl = fetchSpy.mock.calls[0][0] as string;
    const url = new URL(callUrl);
    expect(url.searchParams.get('num')).toBe('5');
  });

  // UC-GC-09 — empty/whitespace query -> [] with no fetch
  it('returns empty array for whitespace query without fetching', async () => {
    const fetchSpy = mockFetch({ body: makeGoogleCseApiResponse([]) });
    global.fetch = fetchSpy;

    const client = new GoogleCseClient({ apiKey: 'fake-api-key', cseId: 'fake-cx' });
    const results = await client.search({ query: '   ' });

    expect(results).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // UC-GC-10 — signal propagation
  it('propagates query.signal into fetch', async () => {
    const fetchSpy = mockFetch({ body: makeGoogleCseApiResponse([]) });
    global.fetch = fetchSpy;

    const controller = new AbortController();
    const client = new GoogleCseClient({ apiKey: 'fake-api-key', cseId: 'fake-cx' });
    await client.search({ query: 'q', signal: controller.signal });

    const callArgs = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(callArgs[1].signal).toBe(controller.signal);
  });

  // INV-10 — readonly name
  it('exposes a stable readonly name', () => {
    const client = new GoogleCseClient({ apiKey: 'fake-api-key', cseId: 'fake-cx' });
    expect(client.name).toBe('google-cse');
  });
});
