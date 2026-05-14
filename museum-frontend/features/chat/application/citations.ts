/**
 * A6 — Citation chips, pure helpers.
 *
 * Pure (no React, no I/O) helpers that derive the chip-cluster view-model
 * from `ChatUiMessageMetadata.sources` returned by the BE. Spec:
 * `docs/chat-ux-refonte/specs/A6.md` §1.1 (R1-R7), §2.2.
 *
 * Heuristic (FE-only — BE schema is unchanged per R16/R17) :
 *   - `museum-catalog` source present → 'high' confidence
 *   - any source with `confidence ≥ 0.8` → 'high'
 *   - non-empty sources otherwise → 'medium'
 *   - empty / undefined `sources` → 'low' (AI-only)
 *
 * The `'ai-knowledge'` family is a FE-only synthetic provenance — never
 * emitted by the BE. It surfaces the UFR-013 honesty doctrine ("response
 * based on AI general knowledge, no source retrieved") via a dedicated chip
 * when `sources` is empty / absent (R4).
 */

import type {
  CitationSource,
  CitationSourceType,
  ChatUiMessageMetadata,
} from '@/features/chat/application/chatSessionLogic.pure';

/** UI-family aggregation of BE `CitationSourceType` (+ FE-only `ai-knowledge`). */
export type CitationFamily = 'museum-catalog' | 'reference-db' | 'web' | 'ai-knowledge';

/** Chip-level confidence aggregated from `sources[].type` + optional `confidence`. */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/** Stable enumeration order used by `selectChipModelsForMessage` to lay chips. */
export const CITATION_FAMILY_ORDER: readonly CitationFamily[] = [
  'museum-catalog',
  'reference-db',
  'web',
  'ai-knowledge',
] as const;

/**
 * Mapping from the 4 BE source types to the 3 non-AI UI families.
 *
 * `wikidata` and `commons` fold into `reference-db` (Wikimedia linked-data
 * ecosystem). The granular distinction stays accessible via the existing
 * bottom-sheet preview that displays the original `title`.
 */
export const FAMILY_FOR_SOURCE_TYPE: Record<
  CitationSourceType,
  Exclude<CitationFamily, 'ai-knowledge'>
> = {
  'museum-catalog': 'museum-catalog',
  wikidata: 'reference-db',
  commons: 'reference-db',
  web: 'web',
};

/** Discriminated chip model — confidence (single, leftmost) + provenance chips. */
export type CitationChipModel =
  | { readonly kind: 'confidence'; readonly level: ConfidenceLevel }
  | { readonly kind: 'provenance'; readonly family: CitationFamily; readonly count: number };

/** Compute the confidence level for a chip cluster — see module JSDoc. */
export function computeConfidenceLevel(
  metadata: ChatUiMessageMetadata | null | undefined,
): ConfidenceLevel {
  const sources = metadata?.sources;
  if (!sources || sources.length === 0) return 'low';
  if (sources.some((s) => s.type === 'museum-catalog')) return 'high';
  if (sources.some((s) => (s.confidence ?? 0) >= 0.8)) return 'high';
  return 'medium';
}

/**
 * Build the ordered chip-model list for a message :
 *   1. exactly one confidence chip (leftmost)
 *   2. zero or more provenance chips, deduplicated by family, ordered by
 *      `CITATION_FAMILY_ORDER`
 *   3. when `sources` is empty / absent → a synthetic `'ai-knowledge'`
 *      provenance chip with `count: 0` is appended (UFR-013 surface, R4).
 */
export function selectChipModelsForMessage(
  metadata: ChatUiMessageMetadata | null | undefined,
): CitationChipModel[] {
  const level = computeConfidenceLevel(metadata);
  const result: CitationChipModel[] = [{ kind: 'confidence', level }];

  const sources: CitationSource[] = metadata?.sources ?? [];
  if (sources.length === 0) {
    result.push({ kind: 'provenance', family: 'ai-knowledge', count: 0 });
    return result;
  }

  const counts = new Map<CitationFamily, number>();
  for (const s of sources) {
    const family = FAMILY_FOR_SOURCE_TYPE[s.type];
    counts.set(family, (counts.get(family) ?? 0) + 1);
  }

  for (const family of CITATION_FAMILY_ORDER) {
    if (family === 'ai-knowledge') continue;
    const count = counts.get(family);
    if (count !== undefined && count > 0) {
      result.push({ kind: 'provenance', family, count });
    }
  }

  return result;
}
