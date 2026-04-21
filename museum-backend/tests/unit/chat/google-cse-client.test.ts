import { GoogleCseClient } from '@modules/chat/adapters/secondary/google-cse.client';
import { mockFetch } from '../../helpers/fetch/fetch-mock.helpers';
import {
  makeGoogleCseItem,
  makeGoogleCseApiResponse,
} from '../../helpers/search-clients/google-cse.fixture';

// Silence logger
jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const originalFetch = global.fetch;

describe('GoogleCseClient', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('returns search results from a successful API response', async () => {
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

    const client = new GoogleCseClient('fake-api-key', 'fake-cse-id');
    const results = await client.search({ query: 'art exhibitions Paris' });

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      url: 'https://example.com/a',
      title: 'Result A',
      snippet: 'Snippet A',
    });
  });

  it('maps link field to url', async () => {
    global.fetch = mockFetch({
      body: makeGoogleCseApiResponse([
        makeGoogleCseItem({
          link: 'https://museum.example.com/monet',
          title: 'Monet Exhibition',
          snippet: 'Water lilies and more',
        }),
      ]),
    });

    const client = new GoogleCseClient('fake-api-key', 'fake-cse-id');
    const results = await client.search({ query: 'Monet' });

    expect(results[0].url).toBe('https://museum.example.com/monet');
  });

  it('returns empty array for empty query', async () => {
    const client = new GoogleCseClient('fake-api-key', 'fake-cse-id');
    const results = await client.search({ query: '   ' });
    expect(results).toEqual([]);
  });

  it('returns empty array on HTTP error response', async () => {
    global.fetch = mockFetch({ ok: false, status: 403 });

    const client = new GoogleCseClient('fake-api-key', 'fake-cse-id');
    const results = await client.search({ query: 'something' });

    expect(results).toEqual([]);
  });

  it('returns empty array when fetch throws', async () => {
    global.fetch = mockFetch(new Error('network down'));

    const client = new GoogleCseClient('fake-api-key', 'fake-cse-id');
    const results = await client.search({ query: 'something' });

    expect(results).toEqual([]);
  });

  it('caps maxResults at 10', async () => {
    const fetchSpy = mockFetch({ body: makeGoogleCseApiResponse([]) });
    global.fetch = fetchSpy;

    const client = new GoogleCseClient('fake-api-key', 'fake-cse-id');
    await client.search({ query: 'q', maxResults: 50 });

    const callUrl = fetchSpy.mock.calls[0]![0] as string;
    const url = new URL(callUrl);
    expect(url.searchParams.get('num')).toBe('10');
  });

  it('uses default 5 max results when not specified', async () => {
    const fetchSpy = mockFetch({ body: makeGoogleCseApiResponse([]) });
    global.fetch = fetchSpy;

    const client = new GoogleCseClient('fake-api-key', 'fake-cse-id');
    await client.search({ query: 'q' });

    const callUrl = fetchSpy.mock.calls[0]![0] as string;
    const url = new URL(callUrl);
    expect(url.searchParams.get('num')).toBe('5');
  });

  it('handles missing items field gracefully', async () => {
    global.fetch = mockFetch({ body: {} });

    const client = new GoogleCseClient('fake-api-key', 'fake-cse-id');
    const results = await client.search({ query: 'something' });

    expect(results).toEqual([]);
  });

  it('includes api key and cse id in request URL', async () => {
    const fetchSpy = mockFetch({ body: makeGoogleCseApiResponse([]) });
    global.fetch = fetchSpy;

    const client = new GoogleCseClient('my-key', 'my-cx');
    await client.search({ query: 'test' });

    const callUrl = fetchSpy.mock.calls[0]![0] as string;
    const url = new URL(callUrl);
    expect(url.searchParams.get('key')).toBe('my-key');
    expect(url.searchParams.get('cx')).toBe('my-cx');
  });
});
