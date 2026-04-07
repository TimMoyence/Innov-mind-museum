import { sha256 } from 'js-sha256';

export interface LocalCacheKeyInput {
  text: string;
  museumId: string;
  locale: string;
  guideLevel?: string;
  audioDescriptionMode?: boolean;
}

/**
 * Normalizes a question for cache key computation.
 * Lowercases, trims, and collapses consecutive whitespace to a single space.
 *
 * IMPORTANT: Must produce identical output to backend `normalizeQuestion()`
 * in `chat-cache-key.util.ts`.
 */
export function normalizeQuestion(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Computes a deterministic local cache key for an LLM response.
 * Format: `chat:llm:{museumId}:{sha256(components).slice(0,16)}`
 *
 * IMPORTANT: This function must produce identical output to the backend
 * `buildCacheKey()` in `chat-cache-key.util.ts`. Any change here requires
 * updating the backend and re-running the parity tests.
 */
export function computeLocalCacheKey(input: LocalCacheKeyInput): string {
  const normalized = normalizeQuestion(input.text);
  const components = [
    normalized,
    input.locale,
    input.guideLevel ?? 'beginner',
    input.audioDescriptionMode ? '1' : '0',
  ].join('|');
  const hash = sha256(components).slice(0, 16);
  return `chat:llm:${input.museumId}:${hash}`;
}
