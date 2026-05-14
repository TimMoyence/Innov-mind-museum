/**
 * A6 — Citation chips (source/confidence badges).
 *
 * BE-side contract red test. A6 does NOT change the BE schema (R16/R17,
 * `docs/chat-ux-refonte/specs/A6.md`), so this red test pins the existing
 * `CitationSource` + `ChatAssistantMetadata.sources` contract that the FE
 * `selectChipModelsForMessage(metadata)` selector relies on (§2.2, AC3).
 *
 * Why a red test at all if the BE doesn't change?
 *
 *   1. To prove the FE-only synthetic family `ai-knowledge` is NEVER admitted
 *      by the BE union — `CitationSourceType` must remain the exact closed
 *      enum `'wikidata' | 'web' | 'museum-catalog' | 'commons'` (R16). If a
 *      future BE PR introduces `ai-knowledge` server-side, this test fires.
 *   2. To pin the assistant-response parser semantics A6 depends on : empty
 *      / undefined `sources` survives the parser as `undefined` (R19, FE
 *      degrades to the AI-knowledge chip per R4).
 *   3. To declare the (future) BE-side selector
 *      `selectCitationChipModels(metadata)` that A6 currently ships as a FE
 *      helper but may be promoted to a shared module under Open Q2. At
 *      baseline (A6 not yet implemented) the helper does NOT exist server
 *      side — the import fails to resolve and Jest fails the suite.
 *
 * Expected baseline failures:
 *
 *   - `selectCitationChipModels` import from `@modules/chat/useCase/orchestration/citation-chip-models`
 *     → "Cannot find module" (or TS resolution error before Jest).
 *   - Type-level `CitationFamily` import → same.
 *
 * Spec: `docs/chat-ux-refonte/specs/A6.md` §1.3, §2.2, §4 (AC3, AC4, AC5).
 */

import {
  CitationSourceSchema,
  type CitationSource,
  type CitationSourceType,
  type ChatAssistantMetadata,
} from '@modules/chat/domain/chat.types';

// RED ASSERTION 1 : the BE-side selector module does NOT exist at baseline.
// Open Q2 in A6.md defers this to V1.1+, but the red test pins the contract
// shape so promoting the selector is a one-file change (move + re-export)
// rather than an API redesign. The import below fails to resolve at baseline.
import {
  type CitationFamily,
  type ConfidenceLevel,
  type CitationChipModel,
  selectCitationChipModels,
} from '@modules/chat/useCase/orchestration/citation-chip-models';

describe('A6 — BE citation metadata contract (red baseline)', () => {
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

  describe('selectCitationChipModels — BE-side selector (Open Q2 future)', () => {
    // RED ASSERTION 2 : these assertions cannot even compile at baseline
    // because `selectCitationChipModels` and the CitationFamily / ConfidenceLevel
    // types are not declared anywhere in the BE module graph yet. The test
    // suite fails at module load (Jest reports "Cannot find module").
    it('returns AI-knowledge chip + low-confidence chip when sources is undefined (AC5)', () => {
      const models = selectCitationChipModels(undefined);
      const families = models
        .filter(
          (m): m is Extract<CitationChipModel, { kind: 'provenance' }> => m.kind === 'provenance',
        )
        .map((m) => m.family);
      const levels = models
        .filter(
          (m): m is Extract<CitationChipModel, { kind: 'confidence' }> => m.kind === 'confidence',
        )
        .map((m) => m.level);
      const aiFamily: CitationFamily = 'ai-knowledge';
      const lowLevel: ConfidenceLevel = 'low';
      expect(families).toContain(aiFamily);
      expect(levels).toContain(lowLevel);
    });

    it('returns High confidence + museum-catalog provenance when sources include museum-catalog (AC4 / AC6)', () => {
      const sources: CitationSource[] = [
        {
          url: 'https://catalogue.musaium.example/artwork/123',
          type: 'museum-catalog',
          title: 'Mona Lisa — Musaium curated record',
          quote: 'Acquired by the Louvre Museum in 1797 as part of the royal collection.',
        },
      ];
      const metadata: ChatAssistantMetadata = { sources };

      const models = selectCitationChipModels(metadata);
      const confidence = models.find(
        (m): m is Extract<CitationChipModel, { kind: 'confidence' }> => m.kind === 'confidence',
      );
      const provenance = models.find(
        (m): m is Extract<CitationChipModel, { kind: 'provenance' }> =>
          m.kind === 'provenance' && m.family === 'museum-catalog',
      );

      expect(confidence?.level).toBe('high');
      expect(provenance).toBeDefined();
      expect(provenance?.count).toBe(1);
    });

    it('deduplicates wikidata + commons into a single reference-db chip with cumulative count (AC7)', () => {
      const sources: CitationSource[] = [
        {
          url: 'https://www.wikidata.org/wiki/Q12418',
          type: 'wikidata',
          title: 'Mona Lisa entity',
          quote: 'The Mona Lisa is a half-length portrait painting by Leonardo da Vinci.',
        },
        {
          url: 'https://commons.wikimedia.org/wiki/File:Mona_Lisa.jpg',
          type: 'commons',
          title: 'Mona Lisa file',
          quote: 'Reproduction of the painting from the Louvre permanent collection.',
        },
      ];
      const models = selectCitationChipModels({ sources });
      const refDb = models.filter(
        (m): m is Extract<CitationChipModel, { kind: 'provenance' }> =>
          m.kind === 'provenance' && m.family === 'reference-db',
      );
      expect(refDb).toHaveLength(1);
      expect(refDb[0]?.count).toBe(2);
    });
  });
});
