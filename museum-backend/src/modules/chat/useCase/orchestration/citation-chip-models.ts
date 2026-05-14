/**
 * A6 — Citation chip models (BE-side selector stub).
 *
 * A6 is a FE-only feature (R16/R17, `docs/chat-ux-refonte/specs/A6.md`) : the
 * BE schema is NOT changed, the synthetic `'ai-knowledge'` family is FE-only,
 * and the `selectCitationChipModels` selector lives in
 * `museum-frontend/features/chat/application/citations.ts`.
 *
 * Open Q2 in A6.md defers the BE-side promotion of the selector to V1.1+ (so
 * that an audit can cross-check FE chips against a server-derived truth in
 * Langfuse). To make that future promotion a one-file change (move + re-export)
 * rather than an API redesign, this module ships the contract shape today :
 *
 *   - `CitationFamily` type alias (mirrors the FE union)
 *   - `ConfidenceLevel` type alias
 *   - `CitationChipModel` discriminated union
 *   - `selectCitationChipModels(metadata)` — pure selector built on
 *     `ChatAssistantMetadata.sources` (the only BE-exposed input today)
 *
 * No new BE field is introduced (NFR8 schema stability). The selector
 * mirrors the FE heuristic 1:1 — if either side drifts, the citation-metadata
 * red test in `tests/unit/chat/citation-metadata.test.ts` will fire.
 *
 * Spec: A6.md §1.3 R16/R17, §2.2, §4 (AC3, AC4, AC5).
 */

import type {
  CitationSource,
  CitationSourceType,
  ChatAssistantMetadata,
} from '@modules/chat/domain/chat.types';

// Re-export for stability of import surface (red test imports the source
// types from this module's neighbours; mirror them here so future callers
// can `import { CitationSource } from '…/citation-chip-models'`).
export type { CitationSource, CitationSourceType, ChatAssistantMetadata };
export { CitationSourceSchema } from '@modules/chat/domain/chat.types';

/**
 * UI-family aggregation of BE `CitationSourceType`. The `'ai-knowledge'`
 * value is FE-only (synthetic, never persisted, never returned by the BE) —
 * it is rendered when `sources` is empty or absent to surface UFR-013
 * honesty doctrine ("answer based on AI general knowledge, no source").
 *
 * R16: this union being declared in the BE codebase does NOT widen the
 * server `CitationSourceType` — that union is unchanged.
 */
export type CitationFamily = 'museum-catalog' | 'reference-db' | 'web' | 'ai-knowledge';

/** Chip-level confidence aggregated from `sources[].type` + optional `confidence`. */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/** Stable enumeration order used by `selectCitationChipModels` to lay out chips. */
export const CITATION_FAMILY_ORDER: readonly CitationFamily[] = [
  'museum-catalog',
  'reference-db',
  'web',
  'ai-knowledge',
] as const;

/**
 * Mapping from the 4 BE source types to the 3 non-AI UI families.
 * `wikidata` and `commons` both fold into `reference-db` (Wikimedia
 * linked-data ecosystem). The granular distinction stays accessible via
 * the bottom-sheet preview that displays the original `title`.
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

/** Discriminated union returned by `selectCitationChipModels`. */
export type CitationChipModel =
  | { readonly kind: 'confidence'; readonly level: ConfidenceLevel }
  | { readonly kind: 'provenance'; readonly family: CitationFamily; readonly count: number };

/**
 * Compute the confidence level for a chip cluster.
 *
 * Heuristic (FE/BE parity — A6.md §0.4) :
 *   - any `museum-catalog` source → high
 *   - any source with `confidence ≥ 0.8` → high
 *   - non-empty sources otherwise → medium
 *   - empty / undefined sources → low (AI-only)
 */
export function computeConfidenceLevel(
  metadata: ChatAssistantMetadata | null | undefined,
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
 *      provenance chip with `count: 0` is appended (UFR-013 surface).
 */
export function selectCitationChipModels(
  metadata: ChatAssistantMetadata | null | undefined,
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
