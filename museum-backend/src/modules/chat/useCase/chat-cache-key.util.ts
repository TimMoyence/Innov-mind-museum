import { createHash } from 'node:crypto';

/**
 *
 */
export interface CacheKeyInput {
  text: string;
  museumId: string;
  locale: string;
  guideLevel: string;
  audioDescriptionMode: boolean;
}

/**
 * Normalizes a question for cache key computation.
 * Lowercases, trims, and collapses consecutive whitespace to a single space.
 */
export function normalizeQuestion(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Builds a deterministic Redis cache key for an LLM response.
 * Format: `chat:llm:{museumId}:{sha256(components).slice(0,16)}`
 *
 * IMPORTANT: This function must produce identical output to the frontend
 * `computeLocalCacheKey()`. Any change here requires updating the frontend
 * and re-running the parity tests.
 */
export function buildCacheKey(input: CacheKeyInput): string {
  const normalized = normalizeQuestion(input.text);
  const components = [
    normalized,
    input.locale,
    input.guideLevel,
    input.audioDescriptionMode ? '1' : '0',
  ].join('|');
  const hash = createHash('sha256').update(components).digest('hex').slice(0, 16);
  return `chat:llm:${input.museumId}:${hash}`;
}
