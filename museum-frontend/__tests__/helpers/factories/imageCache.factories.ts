export interface CacheEntry {
  sizeBytes: number;
  lastAccessMs: number;
  createdMs: number;
}

const DEFAULT_SIZE_BYTES = 1_000;
const DEFAULT_LAST_ACCESS_MS = 1_000;
const DEFAULT_CREATED_MS = 1_000;

export function makeCacheEntry(overrides: Partial<CacheEntry> = {}): CacheEntry {
  return {
    sizeBytes: DEFAULT_SIZE_BYTES,
    lastAccessMs: DEFAULT_LAST_ACCESS_MS,
    createdMs: DEFAULT_CREATED_MS,
    ...overrides,
  };
}

export function makeCacheIndex(
  entries: readonly (readonly [string, Partial<CacheEntry>?])[],
): Record<string, CacheEntry> {
  const index: Record<string, CacheEntry> = {};
  for (const [key, overrides] of entries) {
    index[key] = makeCacheEntry(overrides);
  }
  return index;
}
