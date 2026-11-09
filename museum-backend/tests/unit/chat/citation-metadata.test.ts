import {
  CitationSourceSchema,
  type CitationSourceType,
  type ChatAssistantMetadata,
} from '@modules/chat/domain/chat.types';

describe('A6 — BE citation metadata contract', () => {
  describe('CitationSourceType union stability (R16)', () => {
    it('admits exactly the 4 BE source types — no `ai-knowledge`, no future additions', () => {
      const allowed = ['wikidata', 'web', 'museum-catalog', 'commons'] as const;
      const exhaustive: Record<CitationSourceType, true> = {
        wikidata: true,
        web: true,
        'museum-catalog': true,
        commons: true,
      };
      expect(Object.keys(exhaustive).sort()).toEqual([...allowed].sort());
    });

    it('Zod schema rejects the synthetic FE-only `ai-knowledge` value (R16)', () => {
      const result = CitationSourceSchema.safeParse({
        url: 'https://example.org/',
        type: 'ai-knowledge',
        title: 'AI-only',
        quote: 'This is a quote of more than ten characters.',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ChatAssistantMetadata.sources backward-compat (R19 / NFR5)', () => {
    it('allows `sources` to be absent — FE falls back to AI-knowledge chip', () => {
      const metadata: ChatAssistantMetadata = {};
      expect(metadata.sources).toBeUndefined();
    });

    it('allows `sources` to be an empty array — FE still renders AI-knowledge chip (R4)', () => {
      const metadata: ChatAssistantMetadata = { sources: [] };
      expect(metadata.sources).toEqual([]);
    });

    it('coexists with legacy `citations: string[]` (NFR8)', () => {
      const metadata: ChatAssistantMetadata = {
        citations: ['legacy-string'],
        sources: [
          {
            url: 'https://www.wikidata.org/wiki/Q12418',
            type: 'wikidata',
            title: 'Mona Lisa',
            quote: 'A half-length portrait painting attributed to Leonardo da Vinci.',
          },
        ],
      };
      expect(metadata.citations?.length).toBe(1);
      expect(metadata.sources?.length).toBe(1);
      expect(metadata.sources?.[0]?.type).toBe('wikidata');
    });
  });
});
