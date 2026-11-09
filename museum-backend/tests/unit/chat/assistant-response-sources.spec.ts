import { extractMetadata } from '@modules/chat/useCase/orchestration/assistant-response';

const VALID_SOURCE_A = {
  url: 'https://www.wikidata.org/wiki/Q12418',
  type: 'wikidata' as const,
  title: 'Mona Lisa',
  quote: 'The Mona Lisa is a half-length portrait painting by Leonardo da Vinci.',
};

const VALID_SOURCE_B = {
  url: 'https://commons.wikimedia.org/wiki/File:Mona_Lisa.jpg',
  type: 'commons' as const,
  title: 'Mona Lisa image',
  quote: 'Painted between 1503 and 1519 by Leonardo da Vinci.',
};

const VALID_SOURCE_C = {
  url: 'https://example.org/article-mona-lisa',
  type: 'web' as const,
  title: 'Mona Lisa background',
  quote: 'The painting is housed in the Louvre Museum in Paris, France.',
};

const INVALID_SOURCE_BAD_URL = {
  url: 'not-a-url',
  type: 'web' as const,
  title: 'Bad URL',
  quote: 'A reasonably long quote of more than ten characters.',
};

const INVALID_SOURCE_SHORT_QUOTE = {
  url: 'https://example.org/short',
  type: 'web' as const,
  title: 'Short quote',
  quote: 'tiny',
};

describe('extractMetadata — Citations v2 (sources[]) — T2.2', () => {
  it('R2 — extracts v2 sources only when sources is an array of valid CitationSource entries', () => {
    const meta = extractMetadata({
      sources: [VALID_SOURCE_A, VALID_SOURCE_B, VALID_SOURCE_C],
    });

    expect(meta.sources).toHaveLength(3);
    expect(meta.sources?.[0]?.url).toBe(VALID_SOURCE_A.url);
    expect(meta.sources?.[1]?.type).toBe('commons');
    expect(meta.sources?.[2]?.title).toBe(VALID_SOURCE_C.title);
    expect(meta.citations).toBeUndefined();
  });

  it('NFR8 — legacy citations[] only (v1) keeps parsing unchanged', () => {
    const meta = extractMetadata({
      citations: ['museum-catalog', 'wikidata-q12418'],
    });

    expect(meta.citations).toEqual(['museum-catalog', 'wikidata-q12418']);
    expect(meta.sources).toBeUndefined();
  });

  it('NFR8 — v1 + v2 coexist in same metadata for one release cycle', () => {
    const meta = extractMetadata({
      citations: ['museum-catalog'],
      sources: [VALID_SOURCE_A, VALID_SOURCE_B],
    });

    expect(meta.citations).toEqual(['museum-catalog']);
    expect(meta.sources).toHaveLength(2);
    expect(meta.sources?.[0]?.type).toBe('wikidata');
    expect(meta.sources?.[1]?.type).toBe('commons');
  });

  it('R2 — partial valid : keeps 3 valid, silently drops 2 invalid (no throw)', () => {
    const meta = extractMetadata({
      sources: [
        VALID_SOURCE_A,
        INVALID_SOURCE_BAD_URL,
        VALID_SOURCE_B,
        INVALID_SOURCE_SHORT_QUOTE,
        VALID_SOURCE_C,
      ],
    });

    expect(meta.sources).toHaveLength(3);
    expect(meta.sources?.map((s) => s.url)).toEqual([
      VALID_SOURCE_A.url,
      VALID_SOURCE_B.url,
      VALID_SOURCE_C.url,
    ]);
  });

  it('R2 — malformed total (sources is not an array) → metadata.sources is undefined (graceful)', () => {
    const meta = extractMetadata({
      sources: 'not-an-array',
    });

    expect(meta.sources).toBeUndefined();
  });

  it('R2 — sources is an array but EVERY entry is invalid → metadata.sources is undefined (no empty array)', () => {
    const meta = extractMetadata({
      sources: [INVALID_SOURCE_BAD_URL, INVALID_SOURCE_SHORT_QUOTE],
    });

    expect(meta.sources).toBeUndefined();
  });

  it('NFR8 — pure v1 response (no sources field at all) does NOT break (backward-compat smoke)', () => {
    const meta = extractMetadata({
      detectedArtwork: { title: 'Starry Night', artist: 'Van Gogh', confidence: 0.9 },
      citations: ['museum-catalog'],
      recommendations: ['Visit the Louvre.'],
    });

    expect(meta.detectedArtwork?.title).toBe('Starry Night');
    expect(meta.citations).toEqual(['museum-catalog']);
    expect(meta.recommendations).toEqual(['Visit the Louvre.']);
    expect(meta.sources).toBeUndefined();
  });

  it('R2 — extractMetadata directly returns the parsed sources array (unit-level)', () => {
    const meta = extractMetadata({
      sources: [VALID_SOURCE_A, VALID_SOURCE_B],
    });

    expect(meta.sources).toHaveLength(2);
    expect(meta.sources?.[0]?.quote).toBe(VALID_SOURCE_A.quote);
  });
});
