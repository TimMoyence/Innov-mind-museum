import { createHash } from 'node:crypto';

/**
 * Cache-key contract for the LLM response cache.
 *
 * Why: STRIDE I1 / GDPR Art 32 — the V1 key shape
 * `chat:llm:{museumId}:{hash(text|locale|guideLevel|audioDescriptionMode)}`
 * leaked LLM responses across users in the same museum (audit
 * 2026-04-26 § 5.2 / R1, remediation plan W1.T1). This module
 * implements the agreed Option C — *hybrid classifier-based scoping*:
 *
 *   - generic   → `chat:llm:global:{museumId}:{hash(...)}`
 *   - scoped    → `chat:llm:user:{userId}:{museumId}:{hash(...)}`
 *   - anonymous → `chat:llm:anon:{anonId}:{museumId}:{hash(...)}`
 *
 * Default-safe rule: when in doubt (e.g. classifier flag missing) we
 * fall through to the user-scoped namespace, never to global.
 *
 * IMPORTANT: this function MUST produce the same key string as the
 * frontend `computeLocalCacheKey()`. Any change here requires updating
 * the frontend AND re-running the parity tests.
 *
 * Cache invalidation: existing entries written under the old shape
 * will simply MISS once after deploy and be rebuilt under the new
 * shape; no explicit Redis FLUSH is required.
 */

/** Maximum text length (in chars) for a query to qualify as generic. */
export const GENERIC_TEXT_MAX_LEN = 280;

/** Maximum allowed cache-key string length (Redis key safety guard). */
export const MAX_CACHE_KEY_BYTES = 256;

/**
 * Inputs needed to derive the cache key.
 */
export interface CacheKeyInput {
  text: string;
  museumId: string;
  locale: string;
  guideLevel: string;
  audioDescriptionMode: boolean;
  /** Authenticated user id; mutually exclusive with `anonId`. */
  userId?: number | string | null;
  /** Anonymous device id (frontend-only); mutually exclusive with `userId`. */
  anonId?: string | null;
  /** True when the request carries any prior conversation turns. */
  hasHistory?: boolean;
  /** True when the request carries an image or audio reference. */
  hasAttachment?: boolean;
  /** True when geo coordinates were resolved AND consented to leak to LLM. */
  hasGeo?: boolean;
  /** Coarse geo bucket (city + country, e.g. `"Paris|FR"`). MUST already be coarse. */
  geoBucket?: string | null;
}

/**
 * Normalizes a question for cache key computation.
 * Lowercases, trims, and collapses consecutive whitespace to a single space.
 */
export function normalizeQuestion(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Returns true when the request matches the "generic / FAQ-like" profile
 * and is therefore safe to serve from the global cross-user cache.
 *
 * Default-safe: any undefined flag is treated as TRUE so the function
 * falls through to user/anon scoping rather than to the global namespace.
 */
export function isGenericQuery(input: CacheKeyInput): boolean {
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

function resolveRequester(input: CacheKeyInput): { namespace: 'user' | 'anon'; id: string } {
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
  return createHash('sha256').update(components.join('|')).digest('hex').slice(0, 16);
}

/**
 * Builds a deterministic Redis cache key for an LLM response.
 *
 * @see isGenericQuery for the global-vs-scoped decision.
 * @throws {Error} when scoping is required but no requester id is provided.
 */
export function buildCacheKey(input: CacheKeyInput): string {
  const normalized = normalizeQuestion(input.text);
  const baseComponents = [
    normalized,
    input.locale,
    input.guideLevel,
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

  if (Buffer.byteLength(key, 'utf8') > MAX_CACHE_KEY_BYTES) {
    throw new Error(`chat-cache-key: key exceeds ${String(MAX_CACHE_KEY_BYTES)} bytes`);
  }
  return key;
}
