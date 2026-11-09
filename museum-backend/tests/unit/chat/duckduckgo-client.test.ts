import { DuckDuckGoClient } from '@modules/chat/adapters/secondary/search/duckduckgo.client';
import { mockFetch } from '../../helpers/fetch/fetch-mock.helpers';
import {
  makeDuckDuckGoApiResponse,
  makeDuckDuckGoRelatedTopic,
} from '../../helpers/search-clients/duckduckgo.fixture';

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

  it('returns empty array and warns on HTTP error response', async () => {
    global.fetch = mockFetch({ ok: false, status: 503 });

    const client = new DuckDuckGoClient();
    const results = await client.search({ query: 'q' });

    expect(results).toEqual([]);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('returns empty array when fetch throws', async () => {
    global.fetch = mockFetch(new Error('network down'));

    const client = new DuckDuckGoClient();
    const results = await client.search({ query: 'q' });

    expect(results).toEqual([]);
  });

  it('returns empty array when the Instant Answer payload is empty', async () => {
    global.fetch = mockFetch({ body: {} });

    const client = new DuckDuckGoClient();
    const results = await client.search({ query: 'q' });

    expect(results).toEqual([]);
  });

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

  it('returns empty array for whitespace query without fetching', async () => {
    const fetchSpy = mockFetch({ body: makeDuckDuckGoApiResponse() });
    global.fetch = fetchSpy;

    const client = new DuckDuckGoClient();
    const results = await client.search({ query: ' ' });

    expect(results).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

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

  it('exposes a stable readonly name', () => {
    const client = new DuckDuckGoClient();
    expect(client.name).toBe('duckduckgo');
  });
});
