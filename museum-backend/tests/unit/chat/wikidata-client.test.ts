import { WikidataClient } from '@modules/chat/adapters/secondary/wikidata.client';

const mockSearchResponse = (items: Array<{ id: string; label: string; description?: string }>) => ({
  search: items,
});

const mockSparqlResponse = (bindings: Array<Record<string, { value: string }>>) => ({
  results: { bindings },
});

const MONA_LISA_SEARCH = mockSearchResponse([
  { id: 'Q12418', label: 'Mona Lisa', description: 'oil painting by Leonardo da Vinci' },
]);

const MONA_LISA_SPARQL = mockSparqlResponse([
  {
    creatorLabel: { value: 'Leonardo da Vinci' },
    inception: { value: '1503-01-01T00:00:00Z' },
    materialLabel: { value: 'oil paint' },
    collectionLabel: { value: 'Louvre' },
    movementLabel: { value: 'High Renaissance' },
    genreLabel: { value: 'portrait' },
  },
]);

let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  fetchSpy = jest.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe('WikidataClient', () => {
  const client = new WikidataClient();

  it('returns ArtworkFacts for a known artwork', async () => {
    fetchSpy
      .mockResolvedValueOnce({ ok: true, json: async () => MONA_LISA_SEARCH })
      .mockResolvedValueOnce({ ok: true, json: async () => MONA_LISA_SPARQL });

    const result = await client.lookup({ searchTerm: 'Mona Lisa' });

    expect(result).toEqual({
      qid: 'Q12418',
      title: 'Mona Lisa',
      artist: 'Leonardo da Vinci',
      date: 'c. 1503',
      technique: 'oil paint',
      collection: 'Louvre',
      movement: 'High Renaissance',
      genre: 'portrait',
      imageUrl: undefined,
    });
  });

  it('returns null when no search results', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSearchResponse([]),
    });

    const result = await client.lookup({ searchTerm: 'xyznonexistent' });

    expect(result).toBeNull();
  });

  it('returns null when search results have no art-related descriptions', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () =>
        mockSearchResponse([
          { id: 'Q42', label: 'Douglas Adams', description: 'English author' },
          { id: 'Q100', label: 'Some Item', description: 'software library' },
        ]),
    });

    const result = await client.lookup({ searchTerm: 'Douglas Adams' });

    expect(result).toBeNull();
  });

  it('returns null when SPARQL returns empty bindings', async () => {
    fetchSpy
      .mockResolvedValueOnce({ ok: true, json: async () => MONA_LISA_SEARCH })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSparqlResponse([]),
      });

    const result = await client.lookup({ searchTerm: 'Mona Lisa' });

    expect(result).toBeNull();
  });

  it('returns null on network error (fetch throws)', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Network failure'));

    const result = await client.lookup({ searchTerm: 'Mona Lisa' });

    expect(result).toBeNull();
  });

  it('returns null on HTTP 429', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 429 });

    const result = await client.lookup({ searchTerm: 'Mona Lisa' });

    expect(result).toBeNull();
  });

  it('sends correct User-Agent header', async () => {
    fetchSpy
      .mockResolvedValueOnce({ ok: true, json: async () => MONA_LISA_SEARCH })
      .mockResolvedValueOnce({ ok: true, json: async () => MONA_LISA_SPARQL });

    await client.lookup({ searchTerm: 'Mona Lisa' });

    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // Search call
    const searchCall = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((searchCall[1].headers as Record<string, string>)['User-Agent']).toBe(
      'Musaium/1.0 (https://musaium.app; contact@musaium.app)',
    );

    // SPARQL call
    const sparqlCall = fetchSpy.mock.calls[1] as [string, RequestInit];
    expect((sparqlCall[1].headers as Record<string, string>)['User-Agent']).toBe(
      'Musaium/1.0 (https://musaium.app; contact@musaium.app)',
    );
  });

  it('formats inception date as "c. YYYY"', async () => {
    fetchSpy
      .mockResolvedValueOnce({ ok: true, json: async () => MONA_LISA_SEARCH })
      .mockResolvedValueOnce({
        ok: true,
        json: async () =>
          mockSparqlResponse([
            {
              inception: { value: '1889-06-01T00:00:00Z' },
            },
          ]),
      });

    const result = await client.lookup({ searchTerm: 'Starry Night' });

    expect(result?.date).toBe('c. 1889');
  });

  it('validates QID format (rejects non-Q\\d+ patterns)', async () => {
    // Simulate a search result with an invalid QID
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () =>
        mockSearchResponse([
          {
            id: 'INVALID_ID',
            label: 'Malicious Item',
            description: 'painting',
          },
        ]),
    });

    const result = await client.lookup({ searchTerm: 'test' });

    expect(result).toBeNull();
    // SPARQL should not have been called
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('validates QID format (rejects injection attempts)', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () =>
        mockSearchResponse([
          {
            id: 'Q123} SERVICE <http://evil.com>{ ?x ?y ?z',
            label: 'Injected',
            description: 'painting by someone',
          },
        ]),
    });

    const result = await client.lookup({ searchTerm: 'injection test' });

    expect(result).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('uses provided language parameter', async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () =>
          mockSearchResponse([
            { id: 'Q12418', label: 'La Joconde', description: 'peinture de Leonard de Vinci' },
          ]),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => MONA_LISA_SPARQL });

    await client.lookup({ searchTerm: 'La Joconde', language: 'fr' });

    const searchUrl = (fetchSpy.mock.calls[0] as [string])[0];
    expect(searchUrl).toContain('language=fr');

    const sparqlUrl = (fetchSpy.mock.calls[1] as [string])[0];
    expect(decodeURIComponent(sparqlUrl)).toContain('"fr,en"');
  });

  it('returns null when SPARQL HTTP response is not ok', async () => {
    fetchSpy
      .mockResolvedValueOnce({ ok: true, json: async () => MONA_LISA_SEARCH })
      .mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await client.lookup({ searchTerm: 'Mona Lisa' });

    expect(result).toBeNull();
  });
});
