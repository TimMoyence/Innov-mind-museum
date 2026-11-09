import type { ArtworkFacts } from '@modules/chat/domain/ports/knowledge-base.port';

const ARTIST_BONUS = 0.4;
const MOVEMENT_BONUS = 0.2;
const GENRE_BONUS = 0.15;
const TECHNIQUE_BONUS = 0.15;
const TEMPORAL_BONUS = 0.1;
const TEMPORAL_WINDOW_YEARS = 50;

const normaliseFact = (value: string | undefined): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : undefined;
};

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

const factsMatch = (a: string | undefined, b: string | undefined): boolean => {
  const left = normaliseFact(a);
  const right = normaliseFact(b);
  return left !== undefined && right !== undefined && left === right;
};

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

export const fuse = (
  visual: number,
  meta: number,
  weights: { wVisual: number; wMeta: number },
): number => clamp(weights.wVisual * visual + weights.wMeta * meta, 0, 1);
