/** Adaptive context class — drives the cache TTL per spec section 3.3. */
export type LlmContextClass = 'generic' | 'museum-mode' | 'personalized';

/** Inputs the cache key derives from. */
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
}

/** Cache lookup result. */
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
  /** Classifies the input into a ContextClass for adaptive TTL. */
  classify(input: LlmCacheKeyInput): LlmContextClass;
  /** Looks up an entry. Returns hit=false on miss. */

  lookup<T>(input: LlmCacheKeyInput): Promise<LlmCacheLookupResult<T>>;
  /** Stores an entry with the TTL appropriate for its context class. */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- generic interface API where T constrains the stored value shape (matches CacheService.set pattern)
  store<T>(input: LlmCacheKeyInput, value: T): Promise<void>;
  /** Drops all entries scoped to a museum (admin update hook). */
  invalidateMuseum(museumId: number): Promise<void>;
}
