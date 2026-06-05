/**
 * D4 — factories for the dedicated capped image-cache (carnet re-download).
 *
 * Per UFR-002, no test may inline-construct a cache index entry. The shape
 * mirrors the design.md contract for `imageCachePolicy.pure.ts`:
 * `index: Record<key, { sizeBytes; lastAccessMs; createdMs }>`.
 */

/** A single entry in the image-cache index. */
export interface CacheEntry {
  sizeBytes: number;
  lastAccessMs: number;
  createdMs: number;
}

const DEFAULT_SIZE_BYTES = 1_000;
const DEFAULT_LAST_ACCESS_MS = 1_000;
const DEFAULT_CREATED_MS = 1_000;

/** Builds a single cache index entry with sane defaults. */
export function makeCacheEntry(overrides: Partial<CacheEntry> = {}): CacheEntry {
  return {
    sizeBytes: DEFAULT_SIZE_BYTES,
    lastAccessMs: DEFAULT_LAST_ACCESS_MS,
    createdMs: DEFAULT_CREATED_MS,
    ...overrides,
  };
}

/**
 * Builds a keyed index from `[key, overrides]` pairs.
 * `makeCacheIndex([['a', { sizeBytes: 10 }], ['b', { lastAccessMs: 5 }]])`.
 */
export function makeCacheIndex(
  entries: readonly (readonly [string, Partial<CacheEntry>?])[],
): Record<string, CacheEntry> {
  const index: Record<string, CacheEntry> = {};
  for (const [key, overrides] of entries) {
    index[key] = makeCacheEntry(overrides);
  }
  return index;
}
