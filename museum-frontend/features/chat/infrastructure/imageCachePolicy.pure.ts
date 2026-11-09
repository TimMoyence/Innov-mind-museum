export interface ImageCacheEntry {
  readonly sizeBytes: number;
  readonly lastAccessMs: number;
  readonly createdMs: number;
}

export interface SelectEvictionsOptions {
  readonly capBytes: number;
  readonly maxAgeMs: number;
  readonly nowMs: number;
  readonly incomingSizeBytes?: number;
}

export interface SelectEvictionsResult {
  readonly evictKeys: string[];
  readonly admit: boolean;
}

export const IMAGE_CACHE_CAP_BYTES = 64 * 1024 * 1024;

export const IMAGE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function selectEvictions(
  index: Record<string, ImageCacheEntry>,
  opts: SelectEvictionsOptions,
): SelectEvictionsResult {
  const { capBytes, maxAgeMs, nowMs, incomingSizeBytes = 0 } = opts;

  const evictKeys: string[] = [];
  const evicted = new Set<string>();

  for (const [key, entry] of Object.entries(index)) {
    if (nowMs - entry.createdMs > maxAgeMs) {
      evictKeys.push(key);
      evicted.add(key);
    }
  }

  if (incomingSizeBytes > capBytes) {
    return { evictKeys, admit: false };
  }

  const survivors = Object.entries(index).filter(([key]) => !evicted.has(key));
  let total = survivors.reduce((sum, [, entry]) => sum + entry.sizeBytes, 0) + incomingSizeBytes;

  if (total > capBytes) {
    const byLru = [...survivors].sort(([keyA, a], [keyB, b]) => {
      if (a.lastAccessMs !== b.lastAccessMs) return a.lastAccessMs - b.lastAccessMs;
      return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
    });

    for (const [key, entry] of byLru) {
      if (total <= capBytes) break;
      evictKeys.push(key);
      total -= entry.sizeBytes;
    }
  }

  return { evictKeys, admit: true };
}
