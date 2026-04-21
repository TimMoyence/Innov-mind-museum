import { BraveSearchClient } from '@modules/chat/adapters/secondary/brave-search.client';
import { mockFetch } from '../../helpers/fetch/fetch-mock.helpers';
import {
  makeBraveHit,
  makeBraveApiResponse,
} from '../../helpers/search-clients/brave-search.fixture';

// Silence logger
jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const originalFetch = global.fetch;

describe('BraveSearchClient', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('returns search results from a successful API response', async () => {
    global.fetch = mockFetch({
      body: makeBraveApiResponse([
        makeBraveHit({ url: 'https://example.com/a', title: 'Result A', description: 'Snippet A' }),
        makeBraveHit({ url: 'https://example.com/b', title: 'Result B', description: 'Snippet B' }),
      ]),
    });

    const client = new BraveSearchClient('fake-api-key');
    const results = await client.search({ query: 'art exhibitions Paris' });

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      url: 'https://example.com/a',
      title: 'Result A',
      snippet: 'Snippet A',
    });
  });

  it('maps description field to snippet', async () => {
    global.fetch = mockFetch({
      body: makeBraveApiResponse([
        makeBraveHit({
          url: 'https://museum.example.com/renoir',
          title: 'Renoir Exhibition',
          description: 'A major retrospective of Renoir paintings',
        }),
      ]),
    });

    const client = new BraveSearchClient('fake-api-key');
    const results = await client.search({ query: 'Renoir' });

    expect(results[0].snippet).toBe('A major retrospective of Renoir paintings');
  });

  it('returns empty array for empty query', async () => {
    const client = new BraveSearchClient('fake-api-key');
    const results = await client.search({ query: '   ' });
    expect(results).toEqual([]);
  });

  it('returns empty array on HTTP error response', async () => {
    global.fetch = mockFetch({ ok: false, status: 429 });

    const client = new BraveSearchClient('fake-api-key');
    const results = await client.search({ query: 'something' });

    expect(results).toEqual([]);
  });

  it('returns empty array when fetch throws', async () => {
    global.fetch = mockFetch(new Error('network down'));

    const client = new BraveSearchClient('fake-api-key');
    const results = await client.search({ query: 'something' });

    expect(results).toEqual([]);
  });

  it('caps maxResults at 10', async () => {
    const fetchSpy = mockFetch({ body: makeBraveApiResponse([]) });
    global.fetch = fetchSpy;

    const client = new BraveSearchClient('fake-api-key');
    await client.search({ query: 'q', maxResults: 50 });

    const callUrl = fetchSpy.mock.calls[0]![0] as string;
    const url = new URL(callUrl);
    expect(url.searchParams.get('count')).toBe('10');
  });

  it('uses default 5 max results when not specified', async () => {
    const fetchSpy = mockFetch({ body: makeBraveApiResponse([]) });
    global.fetch = fetchSpy;

    const client = new BraveSearchClient('fake-api-key');
    await client.search({ query: 'q' });

    const callUrl = fetchSpy.mock.calls[0]![0] as string;
    const url = new URL(callUrl);
    expect(url.searchParams.get('count')).toBe('5');
  });

  it('handles missing web.results field gracefully', async () => {
    global.fetch = mockFetch({ body: {} });

    const client = new BraveSearchClient('fake-api-key');
    const results = await client.search({ query: 'something' });

    expect(results).toEqual([]);
  });

  it('handles missing web field gracefully', async () => {
    global.fetch = mockFetch({ body: { web: {} } });

    const client = new BraveSearchClient('fake-api-key');
    const results = await client.search({ query: 'something' });

    expect(results).toEqual([]);
  });

  it('sends X-Subscription-Token header with api key', async () => {
    const fetchSpy = mockFetch({ body: makeBraveApiResponse([]) });
    global.fetch = fetchSpy;

    const client = new BraveSearchClient('my-brave-key');
    await client.search({ query: 'test' });

    const callArgs = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = callArgs[1].headers as Record<string, string>;
    expect(headers['X-Subscription-Token']).toBe('my-brave-key');
  });
});
