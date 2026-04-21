import { DuckDuckGoClient } from '@modules/chat/adapters/secondary/duckduckgo.client';
import { mockFetch } from '../../helpers/fetch/fetch-mock.helpers';
import {
  makeDuckDuckGoApiResponse,
  makeDuckDuckGoRelatedTopic,
} from '../../helpers/search-clients/duckduckgo.fixture';

// Silence logger
jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const originalFetch = global.fetch;

describe('DuckDuckGoClient', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('requires no constructor arguments', () => {
    expect(() => new DuckDuckGoClient()).not.toThrow();
  });

  it('returns AbstractText as first result when present', async () => {
    global.fetch = mockFetch({
      body: makeDuckDuckGoApiResponse({
        AbstractText: 'Claude Monet was a French Impressionist painter.',
        AbstractURL: 'https://en.wikipedia.org/wiki/Claude_Monet',
        Heading: 'Claude Monet',
      }),
    });

    const client = new DuckDuckGoClient();
    const results = await client.search({ query: 'Claude Monet' });

    expect(results[0]).toEqual({
      url: 'https://en.wikipedia.org/wiki/Claude_Monet',
      title: 'Claude Monet',
      snippet: 'Claude Monet was a French Impressionist painter.',
    });
  });

  it('returns RelatedTopics as additional results', async () => {
    global.fetch = mockFetch({
      body: makeDuckDuckGoApiResponse({
        RelatedTopics: [
          makeDuckDuckGoRelatedTopic({
            FirstURL: 'https://example.com/topic-a',
            Text: 'Topic A — Description of topic A',
          }),
          makeDuckDuckGoRelatedTopic({
            FirstURL: 'https://example.com/topic-b',
            Text: 'Topic B — Description of topic B',
          }),
        ],
      }),
    });

    const client = new DuckDuckGoClient();
    const results = await client.search({ query: 'impressionism' });

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      url: 'https://example.com/topic-a',
      title: 'Topic A',
      snippet: 'Description of topic A',
    });
  });

  it('parses Text without em-dash separator as both title and snippet', async () => {
    global.fetch = mockFetch({
      body: makeDuckDuckGoApiResponse({
        RelatedTopics: [
          { FirstURL: 'https://example.com/plain', Text: 'Plain text with no separator' },
        ],
      }),
    });

    const client = new DuckDuckGoClient();
    const results = await client.search({ query: 'test' });

    expect(results[0].title).toBe('Plain text with no separator');
    expect(results[0].snippet).toBe('Plain text with no separator');
  });

  it('flattens nested Topics groups', async () => {
    global.fetch = mockFetch({
      body: makeDuckDuckGoApiResponse({
        RelatedTopics: [
          {
            Topics: [
              { FirstURL: 'https://example.com/nested-a', Text: 'Nested A — Inside a group' },
              { FirstURL: 'https://example.com/nested-b', Text: 'Nested B — Also inside a group' },
            ],
          },
          { FirstURL: 'https://example.com/top-level', Text: 'Top Level — Not nested' },
        ],
      }),
    });

    const client = new DuckDuckGoClient();
    const results = await client.search({ query: 'art' });

    expect(results).toHaveLength(3);
    expect(results[0].url).toBe('https://example.com/nested-a');
    expect(results[1].url).toBe('https://example.com/nested-b');
    expect(results[2].url).toBe('https://example.com/top-level');
  });

  it('skips RelatedTopics entries missing FirstURL or Text', async () => {
    global.fetch = mockFetch({
      body: makeDuckDuckGoApiResponse({
        RelatedTopics: [
          { FirstURL: 'https://example.com/ok', Text: 'Good — Has both fields' },
          { FirstURL: 'https://example.com/no-text' },
          { Text: 'No URL' },
          { FirstURL: '', Text: '' },
        ],
      }),
    });

    const client = new DuckDuckGoClient();
    const results = await client.search({ query: 'test' });

    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://example.com/ok');
  });

  it('returns empty array for empty query', async () => {
    const client = new DuckDuckGoClient();
    const results = await client.search({ query: '   ' });
    expect(results).toEqual([]);
  });

  it('returns empty array on HTTP error response', async () => {
    global.fetch = mockFetch({ ok: false, status: 503 });

    const client = new DuckDuckGoClient();
    const results = await client.search({ query: 'something' });

    expect(results).toEqual([]);
  });

  it('returns empty array when fetch throws', async () => {
    global.fetch = mockFetch(new Error('network down'));

    const client = new DuckDuckGoClient();
    const results = await client.search({ query: 'something' });

    expect(results).toEqual([]);
  });

  it('handles missing RelatedTopics field gracefully', async () => {
    global.fetch = mockFetch({ body: {} });

    const client = new DuckDuckGoClient();
    const results = await client.search({ query: 'something' });

    expect(results).toEqual([]);
  });

  it('caps total results at maxResults', async () => {
    global.fetch = mockFetch({
      body: makeDuckDuckGoApiResponse({
        AbstractText: 'Abstract text',
        AbstractURL: 'https://example.com/abstract',
        Heading: 'Heading',
        RelatedTopics: Array.from({ length: 20 }, (_, i) =>
          makeDuckDuckGoRelatedTopic({
            FirstURL: `https://example.com/${i}`,
            Text: `Topic ${i} — Description ${i}`,
          }),
        ),
      }),
    });

    const client = new DuckDuckGoClient();
    const results = await client.search({ query: 'q', maxResults: 5 });

    expect(results).toHaveLength(5);
  });

  it('caps total results at HARD_RESULT_LIMIT of 10', async () => {
    global.fetch = mockFetch({
      body: makeDuckDuckGoApiResponse({
        AbstractText: 'Abstract text',
        AbstractURL: 'https://example.com/abstract',
        Heading: 'Heading',
        RelatedTopics: Array.from({ length: 20 }, (_, i) =>
          makeDuckDuckGoRelatedTopic({
            FirstURL: `https://example.com/${i}`,
            Text: `Topic ${i} — Description ${i}`,
          }),
        ),
      }),
    });

    const client = new DuckDuckGoClient();
    const results = await client.search({ query: 'q', maxResults: 50 });

    expect(results).toHaveLength(10);
  });

  it('uses default 5 max results when not specified', async () => {
    global.fetch = mockFetch({
      body: makeDuckDuckGoApiResponse({
        RelatedTopics: Array.from({ length: 20 }, (_, i) =>
          makeDuckDuckGoRelatedTopic({
            FirstURL: `https://example.com/${i}`,
            Text: `Topic ${i} — Description ${i}`,
          }),
        ),
      }),
    });

    const client = new DuckDuckGoClient();
    const results = await client.search({ query: 'q' });

    expect(results).toHaveLength(5);
  });

  it('includes correct query params in request URL', async () => {
    const fetchSpy = mockFetch({ body: {} });
    global.fetch = fetchSpy;

    const client = new DuckDuckGoClient();
    await client.search({ query: 'museum Louvre' });

    const callUrl = fetchSpy.mock.calls[0]![0] as string;
    const url = new URL(callUrl);
    expect(url.searchParams.get('q')).toBe('museum Louvre');
    expect(url.searchParams.get('format')).toBe('json');
    expect(url.searchParams.get('no_html')).toBe('1');
    expect(url.searchParams.get('skip_disambig')).toBe('1');
  });
});
