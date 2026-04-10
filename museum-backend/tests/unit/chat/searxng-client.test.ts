import { SearXNGClient } from '@modules/chat/adapters/secondary/searxng.client';

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
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            url: 'https://example.com/a',
            title: 'Result A',
            content: 'Snippet A',
          },
          {
            url: 'https://example.com/b',
            title: 'Result B',
            content: 'Snippet B',
          },
        ],
      }),
    }) as unknown as typeof fetch;

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
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            url: 'https://museum.example.com/picasso',
            title: 'Picasso Exhibition',
            content: 'A major retrospective of Picasso works',
          },
        ],
      }),
    }) as unknown as typeof fetch;

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
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    const client = new SearXNGClient(['https://searx.example.com']);
    const results = await client.search({ query: 'something' });

    expect(results).toEqual([]);
  });

  it('returns empty array when fetch throws', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    const client = new SearXNGClient(['https://searx.example.com']);
    const results = await client.search({ query: 'something' });

    expect(results).toEqual([]);
  });

  it('caps maxResults at 10', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: Array.from({ length: 20 }, (_, i) => ({
          url: `https://example.com/${i}`,
          title: `Result ${i}`,
          content: `Snippet ${i}`,
        })),
      }),
    }) as unknown as typeof fetch;

    const client = new SearXNGClient(['https://searx.example.com']);
    const results = await client.search({ query: 'q', maxResults: 50 });

    expect(results).toHaveLength(10);
  });

  it('uses default 5 max results when not specified', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: Array.from({ length: 20 }, (_, i) => ({
          url: `https://example.com/${i}`,
          title: `Result ${i}`,
          content: `Snippet ${i}`,
        })),
      }),
    }) as unknown as typeof fetch;

    const client = new SearXNGClient(['https://searx.example.com']);
    const results = await client.search({ query: 'q' });

    expect(results).toHaveLength(5);
  });

  it('handles missing results field gracefully', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    const client = new SearXNGClient(['https://searx.example.com']);
    const results = await client.search({ query: 'something' });

    expect(results).toEqual([]);
  });

  it('falls back to second instance when first fails with HTTP error', async () => {
    const fetchSpy = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ url: 'https://fallback.com', title: 'Fallback', content: 'OK' }],
        }),
      }) as unknown as jest.Mock;
    global.fetch = fetchSpy as unknown as typeof fetch;

    const client = new SearXNGClient(['https://searx1.example.com', 'https://searx2.example.com']);
    const results = await client.search({ query: 'test' });

    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://fallback.com');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('falls back to second instance when first throws', async () => {
    const fetchSpy = jest
      .fn()
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ url: 'https://fallback.com', title: 'Fallback', content: 'OK' }],
        }),
      }) as unknown as jest.Mock;
    global.fetch = fetchSpy as unknown as typeof fetch;

    const client = new SearXNGClient(['https://searx1.example.com', 'https://searx2.example.com']);
    const results = await client.search({ query: 'test' });

    expect(results).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('returns empty array when all instances fail', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('all down')) as unknown as typeof fetch;

    const client = new SearXNGClient([
      'https://searx1.example.com',
      'https://searx2.example.com',
      'https://searx3.example.com',
    ]);
    const results = await client.search({ query: 'test' });

    expect(results).toEqual([]);
  });

  it('rotates starting instance on successive calls', async () => {
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    }) as unknown as jest.Mock;
    global.fetch = fetchSpy as unknown as typeof fetch;

    const client = new SearXNGClient(['https://searx1.example.com', 'https://searx2.example.com']);

    await client.search({ query: 'first call' });
    await client.search({ query: 'second call' });

    const firstCallUrl = (fetchSpy.mock.calls[0] as [string])[0];
    const secondCallUrl = (fetchSpy.mock.calls[1] as [string])[0];

    expect(firstCallUrl).toContain('searx1.example.com');
    expect(secondCallUrl).toContain('searx2.example.com');
  });

  it('includes correct query params in request URL', async () => {
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    }) as unknown as jest.Mock;
    global.fetch = fetchSpy as unknown as typeof fetch;

    const client = new SearXNGClient(['https://searx.example.com']);
    await client.search({ query: 'museum art' });

    const callUrl = (fetchSpy.mock.calls[0] as [string])[0];
    const url = new URL(callUrl);
    expect(url.searchParams.get('q')).toBe('museum art');
    expect(url.searchParams.get('format')).toBe('json');
    expect(url.searchParams.get('categories')).toBe('general');
  });
});
