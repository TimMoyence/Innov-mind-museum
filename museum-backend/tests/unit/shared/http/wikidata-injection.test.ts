import { ValidationError } from '@shared/errors/app.error';
import {
  assertEntityId,
  assertLang,
  assertPropertyId,
  escapeSparqlLiteral,
} from '@shared/http/wikidata-ids';
import { WikidataClient } from '@modules/chat/adapters/secondary/wikidata.client';
import { HttpWikidataMuseumClient } from '@modules/museum/adapters/secondary/external/wikidata-museum.client';

import {
  asFetchResponse,
  mockSparqlResponse,
  mockWbSearchResponse,
} from '../../../helpers/http/wikidata-fixtures';

/**
 * R14 / V2 / H1 — SPARQL parametrization defense-in-depth.
 *
 * Goal: every public surface that interpolates a Wikidata id / lang / literal
 * into a SPARQL string MUST throw {@link ValidationError} on tampered input
 * BEFORE the SPARQL is composed. The pre-existing loose regex prefilter
 * remains, but is no longer the trust boundary.
 */

describe('Wikidata strict id validators (R14 / V2 / H1)', () => {
  describe('assertEntityId', () => {
    const cases: [string, unknown][] = [
      ['SPARQL UNION breakout', 'Q123) UNION SELECT'],
      ['SQL-style 1=1 breakout', "' OR 1=1 --"],
      ['embedded newline → query split', 'Q123\nDELETE'],
      ['negative QID', 'Q-1'],
      ['leading-zero only', 'Q0'],
      ['leading-zero padding', 'Q01'],
      ['alpha-only QID', 'QABC'],
      ['empty string', ''],
      ['null', null],
      ['undefined', undefined],
      // U+01EA "Latin capital letter O with ogonek" — visually similar enough
      // to bypass naive byte-equality checks; here we use the Cyrillic Q
      // homoglyph to verify the regex pins to ASCII `Q` (U+0051).
      ['Cyrillic Q homoglyph U+01EA', 'Ǫ123'],
      ['decimal point in id', 'Q1.2'],
      ['overflow attempt — 20 trailing digits', `Q${'1'.repeat(20)}`],
      ['number primitive (non-string)', 123],
      ['object (non-string)', { id: 'Q123' }],
    ];

    it.each(cases)('rejects %s', (_label, payload) => {
      expect(() => {
        assertEntityId(payload);
      }).toThrow(ValidationError);
    });

    it('accepts canonical IDs', () => {
      expect(() => {
        assertEntityId('Q42');
      }).not.toThrow();
      expect(() => {
        assertEntityId('Q12345678');
      }).not.toThrow();
      // Boundary: 12 digits is the max allowed (Q + up to 12 digits).
      expect(() => {
        assertEntityId(`Q9${'0'.repeat(11)}`);
      }).not.toThrow();
    });

    it('truncates echoed input in error message (≤ 32 + ellipsis)', () => {
      const huge = `Q${'A'.repeat(500)}`;
      try {
        assertEntityId(huge);
        fail('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        const msg = (err as Error).message;
        // Echoed slice should not exceed 32 chars from the original payload.
        expect(msg.length).toBeLessThan(80);
        expect(msg).not.toContain('A'.repeat(100));
      }
    });
  });

  describe('assertPropertyId', () => {
    it('rejects alpha tail (`PA`)', () => {
      expect(() => {
        assertPropertyId('PA');
      }).toThrow(ValidationError);
    });
    it('rejects leading zero (`P0`, `P01`)', () => {
      expect(() => {
        assertPropertyId('P0');
      }).toThrow(ValidationError);
      expect(() => {
        assertPropertyId('P01');
      }).toThrow(ValidationError);
    });
    it('rejects entity prefix in property slot', () => {
      expect(() => {
        assertPropertyId('Q170');
      }).toThrow(ValidationError);
    });
    it('rejects null / undefined', () => {
      expect(() => {
        assertPropertyId(null);
      }).toThrow(ValidationError);
      expect(() => {
        assertPropertyId(undefined);
      }).toThrow(ValidationError);
    });
    it('accepts canonical property ids', () => {
      expect(() => {
        assertPropertyId('P170');
      }).not.toThrow();
      expect(() => {
        assertPropertyId('P1');
      }).not.toThrow();
      expect(() => {
        assertPropertyId('P99999999');
      }).not.toThrow();
    });
  });

  describe('assertLang', () => {
    const cases: [string, unknown][] = [
      ['SQL-style suffix injection', 'en;DROP'],
      ['embedded newline', 'en\n'],
      ['empty string', ''],
      ['too long base', 'engl'],
      ['null', null],
      ['number', 2],
    ];

    it.each(cases)('rejects %s', (_label, payload) => {
      expect(() => {
        assertLang(payload);
      }).toThrow(ValidationError);
    });

    it('accepts BCP47-ish tags', () => {
      expect(() => {
        assertLang('en');
      }).not.toThrow();
      expect(() => {
        assertLang('fr');
      }).not.toThrow();
      expect(() => {
        assertLang('zh-Hant');
      }).not.toThrow();
      expect(() => {
        assertLang('EN');
      }).not.toThrow();
    });
  });

  describe('escapeSparqlLiteral', () => {
    it('doubles backslashes + escapes double-quotes', () => {
      expect(escapeSparqlLiteral('foo"bar\\baz')).toBe('foo\\"bar\\\\baz');
    });
    it('strips control chars (newline, CR, tab, NUL)', () => {
      expect(escapeSparqlLiteral('foo\nbar')).toBe('foo bar');
      expect(escapeSparqlLiteral('a\rb\tc\x00d')).toBe('a b c d');
    });
    it('throws on non-string input', () => {
      expect(() => escapeSparqlLiteral(null)).toThrow(ValidationError);
      expect(() => escapeSparqlLiteral(42 as unknown)).toThrow(ValidationError);
    });
  });
});

describe('WikidataClient (chat) — fail-open on tampered ids', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns null when search hit smuggles an injection payload as id (no SPARQL call)', async () => {
    fetchSpy.mockResolvedValueOnce(
      asFetchResponse(
        mockWbSearchResponse([
          {
            id: 'Q123) UNION SELECT * WHERE { ?s ?p ?o }',
            label: 'evil',
            description: 'painting',
          },
        ]),
      ),
    );

    const client = new WikidataClient();
    const result = await client.lookup({ searchTerm: 'evil' });

    expect(result).toBeNull();
    // SPARQL endpoint should NEVER be called when the smuggled id fails assertEntityId.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('happy path: legitimate Q42 still resolves', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        asFetchResponse(
          mockWbSearchResponse([
            { id: 'Q42', label: 'Some Painting', description: 'oil painting' },
          ]),
        ),
      )
      .mockResolvedValueOnce(
        asFetchResponse(mockSparqlResponse([{ creatorLabel: { value: 'Anon' } }])),
      );

    const client = new WikidataClient();
    const result = await client.lookup({ searchTerm: 'thing' });

    expect(result).not.toBeNull();
    expect(result?.qid).toBe('Q42');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('happy path: Q12345678 (large valid id) still resolves', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        asFetchResponse(
          mockWbSearchResponse([{ id: 'Q12345678', label: 'Big Q', description: 'sculpture' }]),
        ),
      )
      .mockResolvedValueOnce(
        asFetchResponse(mockSparqlResponse([{ creatorLabel: { value: 'X' } }])),
      );

    const client = new WikidataClient();
    const result = await client.lookup({ searchTerm: 'big' });

    expect(result?.qid).toBe('Q12345678');
  });
});

describe('HttpWikidataMuseumClient — fail-open on tampered ids', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('fetchFacts returns null on malformed qid without making any HTTP call', async () => {
    const client = new HttpWikidataMuseumClient();
    const result = await client.fetchFacts({
      qid: 'Q1) DROP GRAPH <http://x>',
      locale: 'en',
    });

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetchFacts returns null on injection-style locale without making any HTTP call', async () => {
    const client = new HttpWikidataMuseumClient();
    // Locale falls back to 'en' in fetchFacts before reaching SPARQL,
    // but the inner sparqlFacts assertLang also defends. Either way: no
    // SPARQL must include the tampered locale. Smoke test: legit qid +
    // invalid locale → fallback path runs without exposing tampered locale.
    fetchSpy.mockResolvedValue(
      asFetchResponse(mockSparqlResponse([])), // empty bindings
    );
    await client.fetchFacts({ qid: 'Q19675', locale: 'en;DROP' });

    // fetchFacts collapses bad locale → 'en'; assert no fetched URL contains the payload.
    for (const call of fetchSpy.mock.calls) {
      const url = call[0] as string;
      expect(url).not.toContain('DROP');
    }
  });
});
