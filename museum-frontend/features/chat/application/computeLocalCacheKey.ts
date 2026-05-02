import { sha256 } from 'js-sha256';

/**
 * Cache-key contract — frontend mirror of
 * `museum-backend/src/modules/chat/useCase/chat-cache-key.util.ts`.
 *
 * Why: STRIDE I1 / GDPR Art 32 — V1 key shape leaked LLM responses across
 * users in the same museum (audit 2026-04-26 R1). Implements the agreed
 * Option C — *hybrid classifier-based scoping*:
 *
 *   - generic   → `chat:llm:global:{museumId}:{hash(...)}`
 *   - scoped    → `chat:llm:user:{userId}:{museumId}:{hash(...)}`
 *   - anonymous → `chat:llm:anon:{anonId}:{museumId}:{hash(...)}`
 *
 * IMPORTANT: this function MUST produce the same key string as the
 * backend `buildCacheKey()`. Any change here requires updating the
 * backend AND re-running the parity tests.
 */

/** Maximum text length (in chars) for a query to qualify as generic. */
export const GENERIC_TEXT_MAX_LEN = 280;

/** Maximum allowed cache-key string length (Redis key safety guard). */
export const MAX_CACHE_KEY_BYTES = 256;

export interface LocalCacheKeyInput {
  text: string;
  museumId: string;
  locale: string;
  guideLevel?: string;
  audioDescriptionMode?: boolean;
  /** Authenticated user id; mutually exclusive with `anonId`. */
  userId?: number | string | null;
  /** Anonymous device id from secure-store; mutually exclusive with `userId`. */
  anonId?: string | null;
  /** True when the request carries any prior conversation turns. */
  hasHistory?: boolean;
  /** True when the request carries an image or audio reference. */
  hasAttachment?: boolean;
  /** True when geo coordinates were resolved AND consented to leak to LLM. */
  hasGeo?: boolean;
  /** Coarse geo bucket (city + country). MUST already be coarse. */
  geoBucket?: string | null;
}

/**
 * Normalizes a question for cache key computation.
 * Lowercases, trims, and collapses consecutive whitespace to a single space.
 *
 * MUST stay byte-identical to backend `normalizeQuestion()`.
 */
export function normalizeQuestion(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Returns true when the request matches the "generic / FAQ-like" profile
 * and is therefore safe to serve from the global cross-user cache.
 *
 * Default-safe: any undefined flag is treated as TRUE (i.e. as if context
 * were present), so the function falls through to user/anon scoping.
 */
export function isGenericQuery(input: LocalCacheKeyInput): boolean {
  const hasHistory = input.hasHistory ?? true;
  const hasAttachment = input.hasAttachment ?? true;
  const hasGeo = input.hasGeo ?? true;
  if (hasHistory) return false;
  if (hasAttachment) return false;
  if (hasGeo) return false;
  if (typeof input.text !== 'string') return false;
  if (input.text.length >= GENERIC_TEXT_MAX_LEN) return false;
  return true;
}

function resolveRequester(input: LocalCacheKeyInput): { namespace: 'user' | 'anon'; id: string } {
  const uid = input.userId;
  if (uid !== undefined && uid !== null && String(uid).length > 0) {
    return { namespace: 'user', id: String(uid) };
  }
  const aid = input.anonId;
  if (aid !== undefined && aid !== null && aid.length > 0) {
    return { namespace: 'anon', id: aid };
  }
  throw new Error(
    'chat-cache-key: scoped key requested without userId or anonId — refusing to leak globally',
  );
}

function shortDigest(components: readonly string[]): string {
  return sha256(components.join('|')).slice(0, 16);
}

/**
 * Computes a deterministic local cache key for an LLM response.
 *
 * @see isGenericQuery for the global-vs-scoped decision.
 * @throws when scoping is required but no requester id is provided.
 */
export function computeLocalCacheKey(input: LocalCacheKeyInput): string {
  const normalized = normalizeQuestion(input.text);
  const baseComponents = [
    normalized,
    input.locale,
    input.guideLevel ?? 'beginner',
    input.audioDescriptionMode ? '1' : '0',
  ];

  let key: string;
  if (isGenericQuery(input)) {
    key = `chat:llm:global:${input.museumId}:${shortDigest(baseComponents)}`;
  } else {
    const { namespace, id } = resolveRequester(input);
    const components = [...baseComponents];
    if (input.hasGeo && input.geoBucket && input.geoBucket.length > 0) {
      components.push(`geo:${input.geoBucket}`);
    }
    key = `chat:llm:${namespace}:${id}:${input.museumId}:${shortDigest(components)}`;
  }

  if (key.length > MAX_CACHE_KEY_BYTES) {
    throw new Error(`chat-cache-key: key exceeds ${String(MAX_CACHE_KEY_BYTES)} bytes`);
  }
  return key;
}
