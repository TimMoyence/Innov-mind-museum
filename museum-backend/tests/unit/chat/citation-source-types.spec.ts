/**
 * T2.1 — CitationSource + CitationSourceSchema + ChatAssistantMetadata.sources?
 *
 * Spec: `team-state/2026-05-11-c4-anti-hallucination/spec.md#R1`
 * Design: `team-state/2026-05-11-c4-anti-hallucination/design.md#4`
 *
 * Backward-compat (NFR8): legacy `citations?: string[]` MUST coexist with new
 * `sources?: CitationSource[]` for at least one release cycle.
 *
 * String-match clamp (NG2): `quote.min(10).max(500)` mitigates trivial-match
 * false positives without resorting to fuzzy matching.
 */

import {
  CitationSourceSchema,
  type CitationSource,
  type ChatAssistantMetadata,
} from '@modules/chat/domain/chat.types';

describe('CitationSource type + Zod schema (T2.1)', () => {
  describe('TypeScript compile-time shape', () => {
    it('accepts a fully-shaped CitationSource (compile-time check)', () => {
      const sample: CitationSource = {
        url: 'https://www.wikidata.org/wiki/Q12418',
        type: 'wikidata',
        title: 'Mona Lisa',
        quote: 'The Mona Lisa is a half-length portrait painting by Leonardo da Vinci.',
      };

      expect(sample.type).toBe('wikidata');
      expect(sample.quote.length).toBeGreaterThanOrEqual(10);
    });

    it('allows ChatAssistantMetadata to carry sources? AND legacy citations? simultaneously', () => {
      const metadata: ChatAssistantMetadata = {
        citations: ['museum-catalog'],
        sources: [
          {
            url: 'https://commons.wikimedia.org/wiki/File:Mona_Lisa.jpg',
            type: 'commons',
            title: 'Mona Lisa image',
            quote: 'Painted between 1503 and 1519 by Leonardo da Vinci.',
          },
        ],
      };

      expect(metadata.citations).toHaveLength(1);
      expect(metadata.sources).toHaveLength(1);
      expect(metadata.sources?.[0]?.type).toBe('commons');
    });
  });

  describe('CitationSourceSchema.safeParse', () => {
    it('accepts a valid CitationSource', () => {
      const result = CitationSourceSchema.safeParse({
        url: 'https://www.wikidata.org/wiki/Q12418',
        type: 'wikidata',
        title: 'Mona Lisa',
        quote: 'The Mona Lisa is a half-length portrait painting by Leonardo da Vinci.',
      });

      expect(result.success).toBe(true);
    });

    it('rejects an entry with a non-URL `url`', () => {
      const result = CitationSourceSchema.safeParse({
        url: 'not-a-url',
        type: 'web',
        title: 'Bogus',
        quote: 'A reasonably long quote of more than ten characters.',
      });

      expect(result.success).toBe(false);
    });

    it('rejects a quote shorter than 10 characters (anti trivial-match FP)', () => {
      const result = CitationSourceSchema.safeParse({
        url: 'https://example.org/page',
        type: 'web',
        title: 'Short',
        quote: 'short',
      });

      expect(result.success).toBe(false);
    });

    it('rejects an unknown `type` value', () => {
      const result = CitationSourceSchema.safeParse({
        url: 'https://example.org/page',
        type: 'invalid-source-type',
        title: 'Bad type',
        quote: 'A reasonably long quote of more than ten characters.',
      });

      expect(result.success).toBe(false);
    });

    it('rejects an empty title', () => {
      const result = CitationSourceSchema.safeParse({
        url: 'https://example.org/page',
        type: 'web',
        title: '',
        quote: 'A reasonably long quote of more than ten characters.',
      });

      expect(result.success).toBe(false);
    });

    it('rejects a quote longer than 500 characters (anti-bloat)', () => {
      const result = CitationSourceSchema.safeParse({
        url: 'https://example.org/page',
        type: 'web',
        title: 'Bloat',
        quote: 'x'.repeat(501),
      });

      expect(result.success).toBe(false);
    });

    it('accepts each enum value: wikidata / web / museum-catalog / commons', () => {
      const types = ['wikidata', 'web', 'museum-catalog', 'commons'] as const;

      for (const type of types) {
        const result = CitationSourceSchema.safeParse({
          url: 'https://example.org/page',
          type,
          title: 'Source',
          quote: 'A reasonably long quote of more than ten characters.',
        });

        expect(result.success).toBe(true);
      }
    });
  });
});
