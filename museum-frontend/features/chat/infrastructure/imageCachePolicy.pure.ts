/**
 * W1-D4-FE-01 — pure eviction policy for the dedicated capped image cache
 * (carnet re-download, design.md §Architecture).
 *
 * No expo-file-system, no I/O — this module computes WHICH cache entries must be
 * evicted so the on-disk image cache stays under its byte cap. The caller
 * (`offlineImageStorage.ts`) translates the decision into `deleteAsync` calls.
 *
 * Three orthogonal rules (spec.md R1):
 *   1. Age — any entry older than `maxAgeMs` (now - createdMs) is evictable
 *      regardless of LRU ordering or cap pressure.
 *   2. LRU — when the surviving bytes (existing - aged-out + incoming) still
 *      exceed `capBytes`, evict the least-recently-used entries (smallest
 *      `lastAccessMs` first) until under cap.
 *   3. Oversized-single guard — an incoming image larger than the whole cap can
 *      never fit, so it is rejected (`admit:false`) and we do NOT wipe the cache
 *      to make room for something that will never be admitted.
 */

/** A single entry in the on-disk image-cache index. */
export interface ImageCacheEntry {
  readonly sizeBytes: number;
  /** Epoch ms of the most recent read/write (touch-on-read for LRU). */
  readonly lastAccessMs: number;
  /** Epoch ms the entry was first written (for age-based eviction). */
  readonly createdMs: number;
}

/** Options driving an eviction decision. */
export interface SelectEvictionsOptions {
  /** Hard byte cap for the whole image cache. */
  readonly capBytes: number;
  /** Max age (ms) before an entry is evictable regardless of LRU. */
  readonly maxAgeMs: number;
  /** Current epoch ms (injected for testability — never `Date.now()` inside). */
  readonly nowMs: number;
  /** Size of an image about to be admitted; counts against the cap. */
  readonly incomingSizeBytes?: number;
}

/** Outcome of an eviction decision. */
export interface SelectEvictionsResult {
  /** Keys to delete from disk + index, in eviction order. */
  readonly evictKeys: string[];
  /** Whether the incoming image (if any) may be admitted to the cache. */
  readonly admit: boolean;
}

/**
 * Dedicated cap for the carnet image cache (separate from the TTS cache quota,
 * design.md §Verified anchors). 64 MB of derivatives keeps a healthy carnet
 * browsable offline without contending with the OS-purgeable TTS cache.
 */
export const IMAGE_CACHE_CAP_BYTES = 64 * 1024 * 1024;

/**
 * Max age before a cached derivative is evicted regardless of cap pressure.
 * 30 days — long enough to survive normal re-visits, short enough that a stale
 * derivative is re-minted (via a fresh signed URL) rather than served forever.
 */
export const IMAGE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Computes the set of entries to evict so the cache stays under `capBytes`.
 *
 * Pure + deterministic: same inputs → same output, no side effects.
 */
export function selectEvictions(
  index: Record<string, ImageCacheEntry>,
  opts: SelectEvictionsOptions,
): SelectEvictionsResult {
  const { capBytes, maxAgeMs, nowMs, incomingSizeBytes = 0 } = opts;

  const evictKeys: string[] = [];
  const evicted = new Set<string>();

  // ── Rule 1: age-based eviction (independent of LRU / cap) ────────────────
  for (const [key, entry] of Object.entries(index)) {
    if (nowMs - entry.createdMs > maxAgeMs) {
      evictKeys.push(key);
      evicted.add(key);
    }
  }

  // ── Rule 3: oversized-single guard ───────────────────────────────────────
  // An incoming image bigger than the entire cap can never fit. Reject it
  // WITHOUT evicting survivors to make room for something that will never be
  // admitted. Age-based evictions above still stand (they are unconditional).
  if (incomingSizeBytes > capBytes) {
    return { evictKeys, admit: false };
  }

  // ── Rule 2: LRU eviction under cap pressure ──────────────────────────────
  const survivors = Object.entries(index).filter(([key]) => !evicted.has(key));
  let total = survivors.reduce((sum, [, entry]) => sum + entry.sizeBytes, 0) + incomingSizeBytes;

  if (total > capBytes) {
    // Least-recently-used first (smallest lastAccessMs). Stable tiebreak by key
    // so the decision is fully deterministic.
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
