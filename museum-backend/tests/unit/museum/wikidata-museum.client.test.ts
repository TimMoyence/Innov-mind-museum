import { HttpWikidataMuseumClient } from '@modules/museum/adapters/secondary/external/wikidata-museum.client';

type FetchMock = jest.SpyInstance<ReturnType<typeof fetch>, Parameters<typeof fetch>>;

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Headers(),
  } as unknown as Response;
}

function sparqlBinding(qid: string, label: string, coord?: string) {
  const row: Record<string, { value: string }> = {
    item: { value: `http://www.wikidata.org/entity/${qid}` },
    itemLabel: { value: label },
  };
  if (coord) row.coord = { value: coord };
  return row;
}

describe('HttpWikidataMuseumClient — findMuseumQid', () => {
  let fetchSpy: FetchMock;
  const client = new HttpWikidataMuseumClient();

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch') as unknown as FetchMock;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns high-confidence match when SPARQL returns exactly one hit', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        results: { bindings: [sparqlBinding('Q19675', 'Louvre', 'Point(2.3376 48.8606)')] },
      }),
    );

    const match = await client.findMuseumQid({ name: 'Louvre', locale: 'fr' });

    expect(match).toEqual({
      qid: 'Q19675',
      label: 'Louvre',
      confidence: 'high',
      method: 'name+city',
    });
  });

  it('disambiguates via coordinates when multiple SPARQL candidates', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        results: {
          bindings: [
            sparqlBinding('Q19675', 'Louvre', 'Point(2.3376 48.8606)'), // Paris
            sparqlBinding('Q9999', 'Louvre', 'Point(-73.5 45.5)'), // Canada, far
          ],
        },
      }),
    );

    const match = await client.findMuseumQid({
      name: 'Louvre',
      lat: 48.8606,
      lng: 2.3376,
      locale: 'fr',
    });

    expect(match).toEqual({
      qid: 'Q19675',
      label: 'Louvre',
      confidence: 'high',
      method: 'name+coords',
    });
  });

  it('falls back to wbsearchentities when SPARQL returns no hits', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse({ results: { bindings: [] } }))
      .mockResolvedValueOnce(
        jsonResponse({
          search: [{ id: 'Q12345', label: 'Unknown Museum' }],
        }),
      );

    const match = await client.findMuseumQid({ name: 'Unknown Museum', locale: 'fr' });

    expect(match).toEqual({
      qid: 'Q12345',
      label: 'Unknown Museum',
      confidence: 'low',
      method: 'name-only',
    });
  });

  it('returns null when SPARQL empty AND wbsearch empty', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse({ results: { bindings: [] } }))
      .mockResolvedValueOnce(jsonResponse({ search: [] }));

    const match = await client.findMuseumQid({ name: 'Nothing Here', locale: 'fr' });

    expect(match).toBeNull();
  });

  it('returns null on network error (fail-open)', async () => {
    fetchSpy.mockRejectedValue(new Error('ECONNRESET'));

    const match = await client.findMuseumQid({ name: 'Louvre', locale: 'fr' });

    expect(match).toBeNull();
  });

  it('escapes SPARQL-injection attempts in name filter', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ results: { bindings: [] } }));
    fetchSpy.mockResolvedValueOnce(jsonResponse({ search: [] }));

    await client.findMuseumQid({ name: 'Louvre" } ; DROP { ', locale: 'fr' });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    const decoded = decodeURIComponent(calledUrl);
    // Escaped double-quote must appear as \" in the SPARQL literal — no bare
    // `" }` sequence that could close the rdfs:label string.
    expect(decoded).toContain('\\"');
    expect(decoded).not.toMatch(/rdfs:label "Louvre" \} ; DROP/);
  });
});

describe('HttpWikidataMuseumClient — fetchFacts', () => {
  let fetchSpy: FetchMock;
  const client = new HttpWikidataMuseumClient();

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch') as unknown as FetchMock;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns WikidataMuseumFacts with mapped properties (P856, P1329, P18)', async () => {
    // First call: SPARQL facts; second call: wbgetentities for sitelink title.
    fetchSpy
      .mockResolvedValueOnce(
        jsonResponse({
          results: {
            bindings: [
              {
                itemLabel: { value: 'Louvre' },
                description: { value: 'World-famous art museum' },
                website: { value: 'https://www.louvre.fr' },
                phone: { value: '+33140205050' },
                image: { value: 'https://commons.wikimedia.org/img/Louvre.jpg' },
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          entities: {
            Q19675: { sitelinks: { frwiki: { title: 'Musée du Louvre' } } },
          },
        }),
      );

    const facts = await client.fetchFacts({ qid: 'Q19675', locale: 'fr' });

    expect(facts).toEqual({
      qid: 'Q19675',
      label: 'Louvre',
      summary: 'World-famous art museum',
      website: 'https://www.louvre.fr',
      phone: '+33140205050',
      imageUrl: 'https://commons.wikimedia.org/img/Louvre.jpg',
      wikipediaTitle: 'Musée du Louvre',
    });
  });

  it('returns null on empty SPARQL results', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse({ results: { bindings: [] } }))
      .mockResolvedValueOnce(jsonResponse({ entities: {} }));

    const facts = await client.fetchFacts({ qid: 'Q19675', locale: 'fr' });

    expect(facts).toBeNull();
  });

  it('returns null for invalid QID format', async () => {
    const facts = await client.fetchFacts({ qid: 'not-a-qid', locale: 'fr' });

    expect(facts).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null on network error (fail-open)', async () => {
    fetchSpy.mockRejectedValue(new Error('timeout'));

    const facts = await client.fetchFacts({ qid: 'Q19675', locale: 'fr' });

    expect(facts).toBeNull();
  });
});
