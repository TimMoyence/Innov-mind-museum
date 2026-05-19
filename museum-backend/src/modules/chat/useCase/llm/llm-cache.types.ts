/** Adaptive context class — drives the cache TTL per spec section 3.3. */
export type LlmContextClass = 'generic' | 'museum-mode' | 'personalized';

export interface LlmCacheKeyInput {
  /** OpenAI / Deepseek / Google model id (e.g. 'gpt-4o-mini'). */
  model: string;
  /** User identity scope. `'anon'` for unauthenticated. */
  userId: number | 'anon';
  /** System instruction section name (stable per use case). */
  systemSection: string;
  /** Locale code (response language). */
  locale: string;
  /** Optional museum context. Both fields hashed into the key. */
  museumContext?: { museumId?: number | null; museumName?: string | null };
  /** Optional SHA256 hash of user preferences slice. Stable per user-memory snapshot. */
  userPreferencesHash?: string;
  /** The user-typed prompt text. */
  prompt: string;
  /**
   * C3 — SHA-256 hex prefix (32 chars) of the post-EXIF-strip image buffer.
   * Present iff the request carries an upload-source or legacy-base64 image
   * (NOT a SigLIP / vector embedding hash — pure content-bytes hash, see
   * UFR-013 honesty in spec C3 Q4). When present, the cache key derivation
   * includes it in the canonical input hash, lifting the today's image-bypass
   * and enabling repeat-scan hits. When absent (text-only or url-source),
   * key derivation is byte-identical to today (R8 — no regression on legacy
   * entries).
   */
  imageContentHash?: string;
  /** C9.10 — voice mode prompt branch (80w cap). Distinct cache scope (TD-23-extension). */
  readonly voiceMode?: boolean;
  /** C9.2 — audio-description mode (WCAG 1.1.1 autoplay). Distinct cache scope. */
  readonly audioDescriptionMode?: boolean;
}

export interface LlmCacheLookupResult<T> {
  hit: boolean;
  value: T | null;
  contextClass: LlmContextClass;
}

/**
 * LLM response cache port. Wraps the underlying CacheService with
 * LLM-specific key derivation and TTL adaptation.
 *
 * Spec: see git log (deleted 2026-05-03 — roadmap consolidation, original spec in commit history)
 */
export interface LlmCacheService {
  classify(input: LlmCacheKeyInput): LlmContextClass;
  lookup<T>(input: LlmCacheKeyInput): Promise<LlmCacheLookupResult<T>>;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- generic interface API where T constrains the stored value shape (matches CacheService.set pattern)
  store<T>(input: LlmCacheKeyInput, value: T): Promise<void>;
  /** Drops all entries scoped to a museum (admin update hook). */
  invalidateMuseum(museumId: number): Promise<void>;
}
