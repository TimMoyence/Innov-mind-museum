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
  /**
   * I-FIX2 (2026-05-21) — stable identity of the artwork currently in focus
   * (`session.currentArtworkId` UUID, fallback `currentArtwork.title` sanitised).
   * `[CURRENT ARTWORK]` is rendered in the system prompt (`llm-prompt-builder.ts:74`)
   * but was historically absent from the cache key — two visitors in the same
   * museum asking the same prompt about two different artworks would share a
   * cache line (cross-talk). Folded truthy-only (mirror `imageContentHash`
   * R8/AC6 + `voiceMode`/`audioDescriptionMode` F1 contracts) so legacy
   * text-only entries (no current artwork) produce a byte-identical canonical
   * JSON to pre-I-FIX2 entries — no KEY_VERSION bump required.
   */
  readonly currentArtworkKey?: string;
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
  /**
   * PR-P0-1 (2026-05-23) — Returns the exact byte-string this service would
   * use as Redis key when `lookup()` / `store()` are invoked with the same
   * `input`. Pure (no I/O) and deterministic per input.
   *
   * Intended use: persistence stamping at write time so feedback-driven
   * invalidation can purge the EXACT cached entry without reconstruction.
   * Do NOT use for lookup/store paths — call those methods directly so
   * TTL classification / observability stay on a single code path.
   */
  computeKey(input: LlmCacheKeyInput): string;
  lookup<T>(input: LlmCacheKeyInput): Promise<LlmCacheLookupResult<T>>;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- generic interface API where T constrains the stored value shape (matches CacheService.set pattern)
  store<T>(input: LlmCacheKeyInput, value: T): Promise<void>;
  /** Drops all entries scoped to a museum (admin update hook). */
  invalidateMuseum(museumId: number): Promise<void>;
}
