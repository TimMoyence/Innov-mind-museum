import { TavilyClient } from '@modules/chat/adapters/secondary/search/tavily.client';
import { mockFetch } from '../../helpers/fetch/fetch-mock.helpers';
import { makeTavilyHit, makeTavilyApiResponse } from '../../helpers/search-clients/tavily.fixture';

// Silence logger
jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const originalFetch = global.fetch;

describe('TavilyClient', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('returns search results from a successful API response', async () => {
    global.fetch = mockFetch({
      body: makeTavilyApiResponse([
        makeTavilyHit({ url: 'https://example.com/a', title: 'Result A', content: 'Snippet A' }),
        makeTavilyHit({ url: 'https://example.com/b', title: 'Result B', content: 'Snippet B' }),
      ]),
    });

    const client = new TavilyClient('fake-api-key');
    const results = await client.search({ query: 'art exhibitions Paris' });

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      url: 'https://example.com/a',
      title: 'Result A',
      snippet: 'Snippet A',
    });
  });

  it('returns empty array for empty query', async () => {
    const client = new TavilyClient('fake-api-key');
    const results = await client.search({ query: '   ' });
    expect(results).toEqual([]);
  });

  it('returns empty array on HTTP error response', async () => {
    global.fetch = mockFetch({ ok: false, status: 500 });

    const client = new TavilyClient('fake-api-key');
    const results = await client.search({ query: 'something' });

    expect(results).toEqual([]);
  });

  it('returns empty array when fetch throws', async () => {
    global.fetch = mockFetch(new Error('network down'));

    const client = new TavilyClient('fake-api-key');
    const results = await client.search({ query: 'something' });

    expect(results).toEqual([]);
  });

  it('caps maxResults at 10', async () => {
    const fetchSpy = mockFetch({ body: makeTavilyApiResponse([]) });
    global.fetch = fetchSpy;

    const client = new TavilyClient('fake-api-key');
    await client.search({ query: 'q', maxResults: 50 });

    const callArgs = fetchSpy.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(callArgs[1].body) as { max_results: number };
    expect(body.max_results).toBe(10);
  });

  it('uses default 5 max results when not specified', async () => {
    const fetchSpy = mockFetch({ body: makeTavilyApiResponse([]) });
    global.fetch = fetchSpy;

    const client = new TavilyClient('fake-api-key');
    await client.search({ query: 'q' });

    const callArgs = fetchSpy.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(callArgs[1].body) as { max_results: number };
    expect(body.max_results).toBe(5);
  });

  it('handles missing results field gracefully', async () => {
    global.fetch = mockFetch({ body: {} });

    const client = new TavilyClient('fake-api-key');
    const results = await client.search({ query: 'something' });

    expect(results).toEqual([]);
  });
});
