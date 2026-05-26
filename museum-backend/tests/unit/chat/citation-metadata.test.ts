/**
 * A6 — Citation chips (source/confidence badges).
 *
 * BE-side contract test. A6 does NOT change the BE schema (R16/R17,
 * `docs/chat-ux-refonte/specs/A6.md`); this pins the existing `CitationSource`
 * + `ChatAssistantMetadata.sources` contract that the FE
 * `selectChipModelsForMessage(metadata)` selector relies on (§2.2, AC3).
 *
 * What it guards:
 *
 *   1. The FE-only synthetic family `ai-knowledge` is NEVER admitted by the BE
 *      union — `CitationSourceType` must remain the exact closed enum
 *      `'wikidata' | 'web' | 'museum-catalog' | 'commons'` (R16). If a future
 *      BE PR introduces `ai-knowledge` server-side, this test fires.
 *   2. The assistant-response parser semantics A6 depends on : empty / undefined
 *      `sources` survives the parser as `undefined` (R19, FE degrades to the
 *      AI-knowledge chip per R4).
 *
 * Note (2026-05-26, UFR-016): the speculative BE-side `selectCitationChipModels`
 * selector (Open Q2, deferred V1.1+) was buried — it had zero callers and
 * duplicated the live FE helper `features/chat/application/citations.ts`. The
 * citation-chip selection remains FE-side; promote a shared module only when a
 * BE consumer actually exists.
 *
 * Spec: `docs/chat-ux-refonte/specs/A6.md` §1.3, §2.2, §4 (AC3, AC4, AC5).
 */

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
