import { SearxngClient } from '@modules/chat/adapters/secondary/search/searxng.client';
import { mockFetch } from '../../helpers/fetch/fetch-mock.helpers';
import {
  makeSearxngResult,
  makeSearxngApiResponse,
} from '../../helpers/search-clients/searxng.fixture';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { logger } from '@shared/logger/logger';

const originalFetch = global.fetch;

const INSTANCE_A = 'https://sx-a.example';
const INSTANCE_B = 'https://sx-b.example';

describe('SearxngClient', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('returns normalized search results from a successful instance', async () => {
    global.fetch = mockFetch({
      body: makeSearxngApiResponse([
        makeSearxngResult({
          url: 'https://example.com/a',
          title: 'Result A',
          content: 'Snippet A',
        }),
        makeSearxngResult({
          url: 'https://example.com/b',
          title: 'Result B',
          content: 'Snippet B',
        }),
      ]),
    });

    const client = new SearxngClient([INSTANCE_A]);
    const results = await client.search({ query: 'q' });

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      url: 'https://example.com/a',
      title: 'Result A',
      snippet: 'Snippet A',
    });
  });

  it('builds the instance /search?format=json URL', async () => {
    const fetchSpy = mockFetch({ body: makeSearxngApiResponse([]) });
    global.fetch = fetchSpy;

    const client = new SearxngClient([INSTANCE_A]);
    await client.search({ query: 'art Paris' });

    const callUrl = fetchSpy.mock.calls[0][0] as string;
    const url = new URL(callUrl);
    expect(url.origin + url.pathname).toBe(`${INSTANCE_A}/search`);
    expect(url.searchParams.get('q')).toBe('art Paris');
    expect(url.searchParams.get('format')).toBe('json');
  });

  it('continues to the next instance when the first returns non-ok', async () => {
    global.fetch = mockFetch(
      { ok: false, status: 500 },
      { body: makeSearxngApiResponse([makeSearxngResult({ url: 'https://b.example/1' })]) },
    );

    const client = new SearxngClient([INSTANCE_A, INSTANCE_B]);
    const results = await client.search({ query: 'q' });

    expect(results).toHaveLength(1);
    expect(results[0]!.url).toBe('https://b.example/1');
    expect(logger.warn).toHaveBeenCalled();
  });

  it('continues to the next instance when the first throws', async () => {
    global.fetch = mockFetch(new Error('instance A down'), {
      body: makeSearxngApiResponse([makeSearxngResult({ url: 'https://b.example/2' })]),
    });

    const client = new SearxngClient([INSTANCE_A, INSTANCE_B]);
    const results = await client.search({ query: 'q' });

    expect(results).toHaveLength(1);
    expect(results[0]!.url).toBe('https://b.example/2');
  });

  it('returns empty array when all instances fail', async () => {
    global.fetch = mockFetch({ ok: false, status: 500 }, new Error('B down'));

    const client = new SearxngClient([INSTANCE_A, INSTANCE_B]);
    const results = await client.search({ query: 'q' });

    expect(results).toEqual([]);
  });

  it('returns the first instance results without fetching subsequent instances', async () => {
    const fetchSpy = mockFetch({
      body: makeSearxngApiResponse([makeSearxngResult({ url: 'https://a.example/1' })]),
    });
    global.fetch = fetchSpy;

    const client = new SearxngClient([INSTANCE_A, INSTANCE_B]);
    const results = await client.search({ query: 'q' });

    expect(results).toHaveLength(1);
    expect(results[0]!.url).toBe('https://a.example/1');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('handles a response missing the results field gracefully', async () => {
    global.fetch = mockFetch({ body: {} });

    const client = new SearxngClient([INSTANCE_A]);
    const results = await client.search({ query: 'q' });

    expect(results).toEqual([]);
  });

  it('caps results at 10', async () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      makeSearxngResult({ url: `https://example.com/${i}` }),
    );
    global.fetch = mockFetch({ body: makeSearxngApiResponse(many) });

    const client = new SearxngClient([INSTANCE_A]);
    const results = await client.search({ query: 'q', maxResults: 50 });

    expect(results.length).toBeLessThanOrEqual(10);
  });

  it('returns empty array for whitespace query without fetching', async () => {
    const fetchSpy = mockFetch({ body: makeSearxngApiResponse([]) });
    global.fetch = fetchSpy;

    const client = new SearxngClient([INSTANCE_A]);
    const results = await client.search({ query: '  ' });

    expect(results).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('propagates query.signal into fetch', async () => {
    const fetchSpy = mockFetch({ body: makeSearxngApiResponse([]) });
    global.fetch = fetchSpy;

    const controller = new AbortController();
    const client = new SearxngClient([INSTANCE_A]);
    await client.search({ query: 'q', signal: controller.signal });

    const callArgs = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(callArgs[1].signal).toBe(controller.signal);
  });

  it('returns empty array with no fetch when constructed with an empty instance list', async () => {
    const fetchSpy = mockFetch({ body: makeSearxngApiResponse([]) });
    global.fetch = fetchSpy;

    const client = new SearxngClient([]);
    const results = await client.search({ query: 'q' });

    expect(results).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('exposes a stable readonly name', () => {
    const client = new SearxngClient([INSTANCE_A]);
    expect(client.name).toBe('searxng');
  });
});
