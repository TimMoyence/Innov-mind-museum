/**
 * T5.1 — Pure scorer for the visual-similarity pipeline.
 *
 * Two pure, side-effect-free functions used by
 * {@link VisualSimilarityService} to fuse cosine-similarity scores from the
 * embeddings index with cumulable metadata bonuses derived from Wikidata
 * facts. Both functions are deterministic and synchronous so they can be
 * exhaustively covered by unit tests (no mocks required).
 *
 * Spec:
 *   - design.md §9 D4 — fusion 0.7 visual + 0.3 metadata, metadata bonuses
 *     cumulables capés à 1.0 (artist 0.4 + movement 0.2 + genre 0.15 +
 *     technique 0.15 + temporal ±50y 0.1).
 *   - tasks.md T5.1.
 *   - spec R5 — query metadata score must defensively yield 0 when the
 *     input image has no resolved query facts (UFR-013: don't pretend to
 *     refine when there's no signal).
 */
import type { ArtworkFacts } from '@modules/chat/domain/ports/knowledge-base.port';

/** Bonus awarded when query.artist matches candidate.artist. */
const ARTIST_BONUS = 0.4;
/** Bonus awarded when query.movement matches candidate.movement. */
const MOVEMENT_BONUS = 0.2;
/** Bonus awarded when query.genre matches candidate.genre. */
const GENRE_BONUS = 0.15;
/** Bonus awarded when query.technique matches candidate.technique. */
const TECHNIQUE_BONUS = 0.15;
/** Bonus awarded when query.date and candidate.date are within {@link TEMPORAL_WINDOW_YEARS}. */
const TEMPORAL_BONUS = 0.1;
/** Window (in years) for the temporal proximity bonus. */
const TEMPORAL_WINDOW_YEARS = 50;

/**
 * Normalise a fact string for comparison: trims surrounding whitespace and
 * lower-cases. Returns `undefined` for empty/whitespace-only / non-string
 * inputs so the caller can short-circuit instead of awarding a spurious
 * bonus on `'' === ''`.
 */
const normaliseFact = (value: string | undefined): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : undefined;
};

/**
 * Extract a 4-digit year from a free-form date label (e.g. `"c. 1503"`,
 * `"1907"`, `"1503-1506"`). Returns `undefined` when no year is found, so
 * the temporal bonus stays gated on a real signal.
 */
const extractYear = (date: string | undefined): number | undefined => {
  if (typeof date !== 'string') {
    return undefined;
  }
  const match = /-?\d{1,4}/.exec(date);
  if (match === null) {
    return undefined;
  }
  const year = Number.parseInt(match[0], 10);
  return Number.isFinite(year) ? year : undefined;
};

/** Returns `true` when both normalised facts exist and are equal. */
const factsMatch = (a: string | undefined, b: string | undefined): boolean => {
  const left = normaliseFact(a);
  const right = normaliseFact(b);
  return left !== undefined && right !== undefined && left === right;
};

/** Clamp `value` into the closed interval `[min, max]`. */
const clamp = (value: number, min: number, max: number): number => {
  if (Number.isNaN(value)) {
    return min;
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

/**
 * Compute the metadata score for a candidate against a query in `[0, 1]`.
 *
 * Returns `0` when `query` is `undefined` (no metadata signal — V1 default
 * when the input image carries no resolved QID; cf. design.md §9 D4 last
 * paragraph + UFR-013).
 *
 * Bonuses are cumulable up to 1.0:
 *   - artist match: +0.4
 *   - movement match: +0.2
 *   - genre match: +0.15
 *   - technique/material match: +0.15
 *   - inception date within ±50 years: +0.1
 *
 * String comparisons are trim+lower-case to avoid spurious mismatches on
 * formatting differences from heterogeneous knowledge-base responses.
 *
 * @param query - Resolved facts for the user's input image, or `undefined`.
 * @param candidate - Facts for the candidate match returned by the index.
 * @returns Score in `[0, 1]`.
 */
export const computeMetadataScore = (
  query: ArtworkFacts | undefined,
  candidate: ArtworkFacts,
): number => {
  if (query === undefined) {
    return 0;
  }

  let score = 0;

  if (factsMatch(query.artist, candidate.artist)) {
    score += ARTIST_BONUS;
  }
  if (factsMatch(query.movement, candidate.movement)) {
    score += MOVEMENT_BONUS;
  }
  if (factsMatch(query.genre, candidate.genre)) {
    score += GENRE_BONUS;
  }
  if (factsMatch(query.technique, candidate.technique)) {
    score += TECHNIQUE_BONUS;
  }

  const queryYear = extractYear(query.date);
  const candidateYear = extractYear(candidate.date);
  if (
    queryYear !== undefined &&
    candidateYear !== undefined &&
    Math.abs(queryYear - candidateYear) <= TEMPORAL_WINDOW_YEARS
  ) {
    score += TEMPORAL_BONUS;
  }

  return clamp(score, 0, 1);
};

/**
 * Fuse a visual similarity score with a metadata score using a weighted
 * linear combination, then defensively clamp to `[0, 1]`.
 *
 * Canonical V1 weights are `{ wVisual: 0.7, wMeta: 0.3 }` (design.md §9
 * D4); the function stays generic so the weights can be A/B-tested via
 * environment variables (`VISUAL_W_VISUAL` / `VISUAL_W_META`) without
 * touching the scorer.
 *
 * The clamp protects the contract against:
 *   - float drift (`0.7 * 1 + 0.3 * 1` may not be exactly 1 in IEEE 754),
 *   - mis-summed weight pairs from environment misconfiguration,
 *   - inputs that themselves slipped outside `[0, 1]` upstream.
 *
 * @param visual - Cosine-derived visual similarity in `[0, 1]`.
 * @param meta - Metadata score from {@link computeMetadataScore} in `[0, 1]`.
 * @param weights - Weight pair (typically summing to 1).
 * @param weights.wVisual - Weight applied to the visual score.
 * @param weights.wMeta - Weight applied to the metadata score.
 * @returns Final fused score in `[0, 1]`.
 */
export const fuse = (
  visual: number,
  meta: number,
  weights: { wVisual: number; wMeta: number },
): number => clamp(weights.wVisual * visual + weights.wMeta * meta, 0, 1);
