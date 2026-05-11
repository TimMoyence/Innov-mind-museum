/**
 * T2.2 — assistant-response.ts parser extension for Citations v2 (sources[])
 *
 * Spec: `team-state/2026-05-11-c4-anti-hallucination/spec.md#R2` (+ NFR8 backward-compat).
 * Design: `team-state/2026-05-11-c4-anti-hallucination/design.md#4`.
 *
 * Contract:
 * - `metadata.sources` (v2) is parsed via `CitationSourceSchema.safeParse` per entry.
 *   Valid entries are retained; malformed entries are SILENTLY dropped (no throw).
 * - `metadata.citations` (legacy v1, NFR8) keeps its existing string[] parsing
 *   unchanged for one release cycle.
 * - When the LLM emits both `sources` AND `citations`, BOTH are preserved
 *   (FE may render either; backward-compat 1 cycle).
 * - When `sources` is a non-array (malformed total — e.g. "not-an-array"),
 *   `metadata.sources` is `undefined` (graceful, no throw).
 */

import {
  parseAssistantResponse,
  extractMetadata,
} from '@modules/chat/useCase/orchestration/assistant-response';

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

describe('parseAssistantResponse — Citations v2 (sources[]) — T2.2', () => {
  it('R2 — extracts v2 sources only when sources is an array of valid CitationSource entries', () => {
    const raw = JSON.stringify({
      answer: 'Painted by Leonardo da Vinci.',
      sources: [VALID_SOURCE_A, VALID_SOURCE_B, VALID_SOURCE_C],
    });

    const parsed = parseAssistantResponse(raw);

    expect(parsed.answer).toBe('Painted by Leonardo da Vinci.');
    expect(parsed.metadata.sources).toHaveLength(3);
    expect(parsed.metadata.sources?.[0]?.url).toBe(VALID_SOURCE_A.url);
    expect(parsed.metadata.sources?.[1]?.type).toBe('commons');
    expect(parsed.metadata.sources?.[2]?.title).toBe(VALID_SOURCE_C.title);
    // legacy citations untouched when absent
    expect(parsed.metadata.citations).toBeUndefined();
  });

  it('NFR8 — legacy citations[] only (v1) keeps parsing unchanged', () => {
    const raw = JSON.stringify({
      answer: 'A legacy answer.',
      citations: ['museum-catalog', 'wikidata-q12418'],
    });

    const parsed = parseAssistantResponse(raw);

    expect(parsed.metadata.citations).toEqual(['museum-catalog', 'wikidata-q12418']);
    expect(parsed.metadata.sources).toBeUndefined();
  });

  it('NFR8 — v1 + v2 coexist in same metadata for one release cycle', () => {
    const raw = JSON.stringify({
      answer: 'Hybrid answer.',
      citations: ['museum-catalog'],
      sources: [VALID_SOURCE_A, VALID_SOURCE_B],
    });

    const parsed = parseAssistantResponse(raw);

    expect(parsed.metadata.citations).toEqual(['museum-catalog']);
    expect(parsed.metadata.sources).toHaveLength(2);
    expect(parsed.metadata.sources?.[0]?.type).toBe('wikidata');
    expect(parsed.metadata.sources?.[1]?.type).toBe('commons');
  });

  it('R2 — partial valid : keeps 3 valid, silently drops 2 invalid (no throw)', () => {
    const raw = JSON.stringify({
      answer: 'Mixed batch.',
      sources: [
        VALID_SOURCE_A,
        INVALID_SOURCE_BAD_URL,
        VALID_SOURCE_B,
        INVALID_SOURCE_SHORT_QUOTE,
        VALID_SOURCE_C,
      ],
    });

    const parsed = parseAssistantResponse(raw);

    expect(parsed.metadata.sources).toHaveLength(3);
    expect(parsed.metadata.sources?.map((s) => s.url)).toEqual([
      VALID_SOURCE_A.url,
      VALID_SOURCE_B.url,
      VALID_SOURCE_C.url,
    ]);
  });

  it('R2 — malformed total (sources is not an array) → metadata.sources is undefined (graceful)', () => {
    const raw = JSON.stringify({
      answer: 'Bad shape.',
      sources: 'not-an-array',
    });

    const parsed = parseAssistantResponse(raw);

    expect(parsed.metadata.sources).toBeUndefined();
    // answer + other fields still parse cleanly
    expect(parsed.answer).toBe('Bad shape.');
  });

  it('R2 — sources is an array but EVERY entry is invalid → metadata.sources is undefined (no empty array)', () => {
    const raw = JSON.stringify({
      answer: 'All invalid.',
      sources: [INVALID_SOURCE_BAD_URL, INVALID_SOURCE_SHORT_QUOTE],
    });

    const parsed = parseAssistantResponse(raw);

    expect(parsed.metadata.sources).toBeUndefined();
  });

  it('NFR8 — pure v1 response (no sources field at all) does NOT break (backward-compat smoke)', () => {
    const raw = JSON.stringify({
      answer: 'A pre-C4 response.',
      detectedArtwork: { title: 'Starry Night', artist: 'Van Gogh', confidence: 0.9 },
      citations: ['museum-catalog'],
      recommendations: ['Visit the Louvre.'],
    });

    const parsed = parseAssistantResponse(raw);

    expect(parsed.answer).toBe('A pre-C4 response.');
    expect(parsed.metadata.detectedArtwork?.title).toBe('Starry Night');
    expect(parsed.metadata.citations).toEqual(['museum-catalog']);
    expect(parsed.metadata.recommendations).toEqual(['Visit the Louvre.']);
    expect(parsed.metadata.sources).toBeUndefined();
  });

  it('R2 — extractMetadata directly returns the parsed sources array (unit-level)', () => {
    const meta = extractMetadata({
      sources: [VALID_SOURCE_A, VALID_SOURCE_B],
    });

    expect(meta.sources).toHaveLength(2);
    expect(meta.sources?.[0]?.quote).toBe(VALID_SOURCE_A.quote);
  });
});
