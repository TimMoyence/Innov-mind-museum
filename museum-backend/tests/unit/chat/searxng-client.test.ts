import { SearXNGClient } from '@modules/chat/adapters/secondary/searxng.client';
import { mockFetch } from '../../helpers/fetch/fetch-mock.helpers';
import {
  makeSearxngHit,
  makeSearxngApiResponse,
} from '../../helpers/search-clients/searxng.fixture';

// Silence logger
jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const originalFetch = global.fetch;

describe('SearXNGClient', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('returns search results from a successful API response', async () => {
    global.fetch = mockFetch({
      body: makeSearxngApiResponse([
        makeSearxngHit({ url: 'https://example.com/a', title: 'Result A', content: 'Snippet A' }),
        makeSearxngHit({ url: 'https://example.com/b', title: 'Result B', content: 'Snippet B' }),
      ]),
    });

    const client = new SearXNGClient(['https://searx.example.com']);
    const results = await client.search({ query: 'art exhibitions Paris' });

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      url: 'https://example.com/a',
      title: 'Result A',
      snippet: 'Snippet A',
    });
  });

  it('maps content field to snippet', async () => {
    global.fetch = mockFetch({
      body: makeSearxngApiResponse([
        makeSearxngHit({
          url: 'https://museum.example.com/picasso',
          title: 'Picasso Exhibition',
          content: 'A major retrospective of Picasso works',
        }),
      ]),
    });

    const client = new SearXNGClient(['https://searx.example.com']);
    const results = await client.search({ query: 'Picasso' });

    expect(results[0].snippet).toBe('A major retrospective of Picasso works');
  });

  it('returns empty array for empty query', async () => {
    const client = new SearXNGClient(['https://searx.example.com']);
    const results = await client.search({ query: '   ' });
    expect(results).toEqual([]);
  });

  it('returns empty array when no instances provided', async () => {
    const client = new SearXNGClient([]);
    const results = await client.search({ query: 'something' });
    expect(results).toEqual([]);
  });

  it('returns empty array on HTTP error response', async () => {
    global.fetch = mockFetch({ ok: false, status: 500 });

    const client = new SearXNGClient(['https://searx.example.com']);
    const results = await client.search({ query: 'something' });

    expect(results).toEqual([]);
  });

  it('returns empty array when fetch throws', async () => {
    global.fetch = mockFetch(new Error('network down'));

    const client = new SearXNGClient(['https://searx.example.com']);
    const results = await client.search({ query: 'something' });

    expect(results).toEqual([]);
  });

  it('caps maxResults at 10', async () => {
    global.fetch = mockFetch({
      body: makeSearxngApiResponse(
        Array.from({ length: 20 }, (_, i) =>
          makeSearxngHit({
            url: `https://example.com/${i}`,
            title: `Result ${i}`,
            content: `Snippet ${i}`,
          }),
        ),
      ),
    });

    const client = new SearXNGClient(['https://searx.example.com']);
    const results = await client.search({ query: 'q', maxResults: 50 });

    expect(results).toHaveLength(10);
  });

  it('uses default 5 max results when not specified', async () => {
    global.fetch = mockFetch({
      body: makeSearxngApiResponse(
        Array.from({ length: 20 }, (_, i) =>
          makeSearxngHit({
            url: `https://example.com/${i}`,
            title: `Result ${i}`,
            content: `Snippet ${i}`,
          }),
        ),
      ),
    });

    const client = new SearXNGClient(['https://searx.example.com']);
    const results = await client.search({ query: 'q' });

    expect(results).toHaveLength(5);
  });

  it('handles missing results field gracefully', async () => {
    global.fetch = mockFetch({ body: {} });

    const client = new SearXNGClient(['https://searx.example.com']);
    const results = await client.search({ query: 'something' });

    expect(results).toEqual([]);
  });

  it('falls back to second instance when first fails with HTTP error', async () => {
    const fetchSpy = mockFetch(
      { ok: false, status: 503 },
      {
        body: makeSearxngApiResponse([
          makeSearxngHit({ url: 'https://fallback.com', title: 'Fallback', content: 'OK' }),
        ]),
      },
    );
    global.fetch = fetchSpy;

    const client = new SearXNGClient(['https://searx1.example.com', 'https://searx2.example.com']);
    const results = await client.search({ query: 'test' });

    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://fallback.com');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('falls back to second instance when first throws', async () => {
    const fetchSpy = mockFetch(new Error('connection refused'), {
      body: makeSearxngApiResponse([
        makeSearxngHit({ url: 'https://fallback.com', title: 'Fallback', content: 'OK' }),
      ]),
    });
    global.fetch = fetchSpy;

    const client = new SearXNGClient(['https://searx1.example.com', 'https://searx2.example.com']);
    const results = await client.search({ query: 'test' });

    expect(results).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('returns empty array when all instances fail', async () => {
    global.fetch = mockFetch(new Error('all down'));

    const client = new SearXNGClient([
      'https://searx1.example.com',
      'https://searx2.example.com',
      'https://searx3.example.com',
    ]);
    const results = await client.search({ query: 'test' });

    expect(results).toEqual([]);
  });

  it('rotates starting instance on successive calls', async () => {
    const fetchSpy = mockFetch({ body: makeSearxngApiResponse([]) });
    global.fetch = fetchSpy;

    const client = new SearXNGClient(['https://searx1.example.com', 'https://searx2.example.com']);

    await client.search({ query: 'first call' });
    await client.search({ query: 'second call' });

    const firstCallUrl = fetchSpy.mock.calls[0]![0] as string;
    const secondCallUrl = fetchSpy.mock.calls[1]![0] as string;

    expect(firstCallUrl).toContain('searx1.example.com');
    expect(secondCallUrl).toContain('searx2.example.com');
  });

  it('includes correct query params in request URL', async () => {
    const fetchSpy = mockFetch({ body: makeSearxngApiResponse([]) });
    global.fetch = fetchSpy;

    const client = new SearXNGClient(['https://searx.example.com']);
    await client.search({ query: 'museum art' });

    const callUrl = fetchSpy.mock.calls[0]![0] as string;
    const url = new URL(callUrl);
    expect(url.searchParams.get('q')).toBe('museum art');
    expect(url.searchParams.get('format')).toBe('json');
    expect(url.searchParams.get('categories')).toBe('general');
  });
});
