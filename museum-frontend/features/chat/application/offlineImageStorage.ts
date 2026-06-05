import * as FileSystem from 'expo-file-system/legacy';

import {
  IMAGE_CACHE_CAP_BYTES,
  IMAGE_CACHE_MAX_AGE_MS,
  selectEvictions,
  type ImageCacheEntry,
} from '@/features/chat/infrastructure/imageCachePolicy.pure';

const OFFLINE_IMAGE_DIR_NAME = 'offline-images';

function getOfflineImageDirUri(): string {
  return `${FileSystem.documentDirectory ?? ''}${OFFLINE_IMAGE_DIR_NAME}/`;
}

/**
 * Copies a temporary image URI to a persistent location in the document directory.
 * Returns the persistent URI that survives app restarts.
 */
export async function persistOfflineImage(tempUri: string): Promise<string> {
  const dirUri = getOfflineImageDirUri();
  const dirInfo = await FileSystem.getInfoAsync(dirUri);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
  }

  const filename = `img-${String(Date.now())}-${Math.random().toString(36).slice(2)}.jpg`;
  const destination = `${dirUri}${filename}`;

  await FileSystem.copyAsync({ from: tempUri, to: destination });
  return destination;
}

/**
 * Checks whether the given URI points to the offline-images persistent directory.
 */
export function isPersistedOfflineImage(uri: string): boolean {
  return uri.startsWith(getOfflineImageDirUri());
}

/**
 * Deletes a persisted offline image if it exists in the offline-images directory.
 * Silently ignores errors (e.g. file already deleted, not a persisted image).
 */
export async function cleanupOfflineImage(uri: string): Promise<void> {
  if (!isPersistedOfflineImage(uri)) return;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }
  } catch {
    // Cleanup is best-effort — ignore failures
  }
}

/**
 * Deletes multiple persisted offline images.
 */
export async function cleanupOfflineImages(uris: string[]): Promise<void> {
  await Promise.all(uris.map((uri) => cleanupOfflineImage(uri)));
}

// ─────────────────────────────────────────────────────────────────────────────
// W1-D4-FE-03 — dedicated capped image cache (carnet re-download).
//
// Stores re-downloaded message-image derivatives under the SAME
// `documentDirectory/offline-images/` directory (its own dedicated cap, distinct
// from the OS-purgeable TTS cache — design.md §Verified anchors). On every write
// the cache is held under `IMAGE_CACHE_CAP_BYTES` by evicting LRU / over-age
// entries via the pure `selectEvictions` policy. An index (key → metadata) is
// persisted so LRU survives restarts; on a miss it is reconstructed from disk.
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_INDEX_FILENAME = 'index.json';
const CACHE_FILE_PREFIX = 'cache-';
const CACHE_FILE_EXT = '.jpg';

/**
 * The slice of the `expo-file-system/legacy` surface the capped cache needs
 * beyond what the persist helpers above use. `downloadAsync` / `readDirectory`
 * / string-read-write are resolved through a LIVE module reference (below)
 * rather than the wildcard-namespace import, because the `import * as
 * FileSystem` interop snapshots the module's own enumerable properties at
 * evaluation time — methods the host environment (or a test harness) exposes
 * lazily would otherwise be invisible to the snapshot.
 */
interface CappedCacheFs {
  downloadAsync(uri: string, fileUri: string): Promise<{ uri: string; status: number }>;
  readDirectoryAsync(dirUri: string): Promise<string[]>;
  writeAsStringAsync(fileUri: string, contents: string): Promise<void>;
  readAsStringAsync(fileUri: string): Promise<string>;
  getInfoAsync(uri: string): Promise<{ exists: boolean; size?: number }>;
  makeDirectoryAsync(uri: string, opts: { intermediates: boolean }): Promise<void>;
  deleteAsync(uri: string, opts: { idempotent: boolean }): Promise<void>;
}

/**
 * Resolves the live `expo-file-system/legacy` module. Lazy-require mirrors the
 * sanctioned native-module access pattern used in `useChatSession.ts:137`
 * (CLAUDE.md § iOS gotcha — "lazy `require()` sur native modules") and, unlike
 * the wildcard import, reflects the module's full runtime surface.
 */
function getFs(): CappedCacheFs {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- live native-module surface; wildcard import snapshots props at eval time (see CappedCacheFs doc). Approved-by: green-2026-06-02-weak-net-carnet-cache
  return require('expo-file-system/legacy') as CappedCacheFs;
}

/** Persisted per-key metadata, keyed by the cache key (not the on-disk name). */
type CacheIndex = Record<string, ImageCacheEntry>;

/** Maps a cache key to a deterministic, path-traversal-safe on-disk filename. */
function cacheFilenameForKey(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${CACHE_FILE_PREFIX}${safe}${CACHE_FILE_EXT}`;
}

/** Resolves the absolute URI of a cached derivative for the given key. */
function cacheUriForKey(key: string): string {
  return `${getOfflineImageDirUri()}${cacheFilenameForKey(key)}`;
}

/** Recovers the cache key embedded in an on-disk filename, or null. */
function keyFromCacheFilename(filename: string): string | null {
  if (!filename.startsWith(CACHE_FILE_PREFIX) || !filename.endsWith(CACHE_FILE_EXT)) {
    return null;
  }
  return filename.slice(CACHE_FILE_PREFIX.length, filename.length - CACHE_FILE_EXT.length);
}

async function ensureCacheDir(): Promise<string> {
  const fs = getFs();
  const dirUri = getOfflineImageDirUri();
  const dirInfo = await fs.getInfoAsync(dirUri);
  if (!dirInfo.exists) {
    await fs.makeDirectoryAsync(dirUri, { intermediates: true });
  }
  return dirUri;
}

async function readCacheIndex(): Promise<CacheIndex> {
  const fs = getFs();
  const indexUri = `${getOfflineImageDirUri()}${CACHE_INDEX_FILENAME}`;
  try {
    const raw = await fs.readAsStringAsync(indexUri);
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object') {
      return parsed as CacheIndex;
    }
  } catch {
    // Missing / corrupt index → rebuilt from disk below. Best-effort.
  }
  return {};
}

async function writeCacheIndex(index: CacheIndex): Promise<void> {
  const fs = getFs();
  const indexUri = `${getOfflineImageDirUri()}${CACHE_INDEX_FILENAME}`;
  try {
    await fs.writeAsStringAsync(indexUri, JSON.stringify(index));
  } catch {
    // Index persistence is best-effort — a write failure must never break the
    // primary flow (the file itself is already on disk; lib-docs expo-file-system
    // LESSONS.md: cache writes are best-effort).
  }
}

/**
 * Reconstructs the in-memory index from the on-disk directory, merging persisted
 * metadata where available. Each cache file is stat'd so its true size counts
 * against the cap even when the persisted index is empty (post-wipe / corrupt).
 */
async function buildCurrentIndex(dirUri: string, persisted: CacheIndex): Promise<CacheIndex> {
  const fs = getFs();
  let filenames: string[] = [];
  try {
    filenames = await fs.readDirectoryAsync(dirUri);
  } catch {
    return {};
  }

  const nowMs = Date.now();
  const index: CacheIndex = {};
  for (const filename of filenames) {
    const key = keyFromCacheFilename(filename);
    if (key === null) continue; // skip index.json + non-cache files

    let sizeBytes = persisted[key]?.sizeBytes ?? 0;
    try {
      const info = await fs.getInfoAsync(`${dirUri}${filename}`);
      if (info.exists && typeof info.size === 'number') {
        sizeBytes = info.size;
      }
    } catch {
      // Stat failure → fall back to persisted size (or 0).
    }

    index[key] = {
      sizeBytes,
      lastAccessMs: persisted[key]?.lastAccessMs ?? nowMs,
      createdMs: persisted[key]?.createdMs ?? nowMs,
    };
  }
  return index;
}

/**
 * Returns the URI of a cached derivative for `key`, or `null` on a miss
 * (cold start / post-wipe). Touches the LRU access time on a hit.
 */
export async function getCachedImage(key: string): Promise<string | null> {
  const fs = getFs();
  const fileUri = cacheUriForKey(key);
  try {
    const info = await fs.getInfoAsync(fileUri);
    if (!info.exists) return null;

    // Touch-on-read so LRU reflects genuine usage. Best-effort.
    const index = await readCacheIndex();
    const existing = index[key];
    const nowMs = Date.now();
    index[key] = {
      sizeBytes: existing?.sizeBytes ?? (typeof info.size === 'number' ? info.size : 0),
      lastAccessMs: nowMs,
      createdMs: existing?.createdMs ?? nowMs,
    };
    await writeCacheIndex(index);

    return fileUri;
  } catch {
    return null;
  }
}

/**
 * Downloads `remoteUrl` (a freshly-minted signed URL) into the capped cache
 * under `key`, enforces the byte cap by evicting LRU / over-age entries, and
 * returns the cached URI. Returns `null` if the download fails or the image is
 * larger than the entire cap (oversized-single guard — never wipes the cache).
 */
export async function cacheRemoteImage(key: string, remoteUrl: string): Promise<string | null> {
  const fs = getFs();
  const dirUri = await ensureCacheDir();
  const fileUri = cacheUriForKey(key);

  let downloadedSize = 0;
  try {
    await fs.downloadAsync(remoteUrl, fileUri);
    const info = await fs.getInfoAsync(fileUri);
    if (!info.exists) return null;
    downloadedSize = typeof info.size === 'number' ? info.size : 0;
  } catch {
    return null;
  }

  const persisted = await readCacheIndex();
  // Existing entries (excluding the just-written key) form the eviction
  // candidate set; the fresh download is passed as `incomingSizeBytes` so the
  // oversized-single guard can reject it WITHOUT counting it as a survivor.
  const existing = omitKeys(await buildCurrentIndex(dirUri, persisted), [key]);

  const nowMs = Date.now();
  const { evictKeys, admit } = selectEvictions(existing, {
    capBytes: IMAGE_CACHE_CAP_BYTES,
    maxAgeMs: IMAGE_CACHE_MAX_AGE_MS,
    nowMs,
    incomingSizeBytes: downloadedSize,
  });

  // Translate the policy decision into disk deletes.
  for (const evictKey of evictKeys) {
    try {
      await fs.deleteAsync(cacheFileUriForEvictedKey(dirUri, evictKey), { idempotent: true });
    } catch {
      // Best-effort eviction — a failed delete must not break caching.
    }
  }
  const survivingIndex = omitKeys(existing, evictKeys);

  if (!admit) {
    // Oversized-single image: drop the just-downloaded file, keep survivors.
    try {
      await fs.deleteAsync(fileUri, { idempotent: true });
    } catch {
      // Best-effort.
    }
    await writeCacheIndex(survivingIndex);
    return null;
  }

  const nextIndex: CacheIndex = {
    ...survivingIndex,
    [key]: { sizeBytes: downloadedSize, lastAccessMs: nowMs, createdMs: nowMs },
  };
  await writeCacheIndex(nextIndex);
  return fileUri;
}

/**
 * Resolves the on-disk URI to delete for an evicted entry. The eviction key is
 * the cache key reconstructed from the on-disk filename, so this maps it back
 * to the same `cache-<key>.jpg` path.
 */
function cacheFileUriForEvictedKey(dirUri: string, evictKey: string): string {
  return `${dirUri}${cacheFilenameForKey(evictKey)}`;
}

/** Returns a new index with the given keys removed (immutable, no `delete`). */
function omitKeys(index: CacheIndex, keys: readonly string[]): CacheIndex {
  const removed = new Set(keys);
  const next: CacheIndex = {};
  for (const [k, entry] of Object.entries(index)) {
    if (!removed.has(k)) next[k] = entry;
  }
  return next;
}
