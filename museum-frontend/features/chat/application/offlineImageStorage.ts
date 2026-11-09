import { generateRequestId } from '@/shared/infrastructure/requestId';
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

export async function persistOfflineImage(tempUri: string): Promise<string> {
  const dirUri = getOfflineImageDirUri();
  const dirInfo = await FileSystem.getInfoAsync(dirUri);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
  }

  const filename = `img-${generateRequestId()}.jpg`;
  const destination = `${dirUri}${filename}`;

  await FileSystem.copyAsync({ from: tempUri, to: destination });
  return destination;
}

export function isPersistedOfflineImage(uri: string): boolean {
  return uri.startsWith(getOfflineImageDirUri());
}

export async function cleanupOfflineImage(uri: string): Promise<void> {
  if (!isPersistedOfflineImage(uri)) return;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }
  } catch {}
}

export async function cleanupOfflineImages(uris: string[]): Promise<void> {
  await Promise.all(uris.map((uri) => cleanupOfflineImage(uri)));
}

const CACHE_INDEX_FILENAME = 'index.json';
const CACHE_FILE_PREFIX = 'cache-';
const CACHE_FILE_EXT = '.jpg';

interface CappedCacheFs {
  downloadAsync(uri: string, fileUri: string): Promise<{ uri: string; status: number }>;
  readDirectoryAsync(dirUri: string): Promise<string[]>;
  writeAsStringAsync(fileUri: string, contents: string): Promise<void>;
  readAsStringAsync(fileUri: string): Promise<string>;
  getInfoAsync(uri: string): Promise<{ exists: boolean; size?: number }>;
  makeDirectoryAsync(uri: string, opts: { intermediates: boolean }): Promise<void>;
  deleteAsync(uri: string, opts: { idempotent: boolean }): Promise<void>;
}

function getFs(): CappedCacheFs {
  return FileSystem;
}

type CacheIndex = Record<string, ImageCacheEntry>;

function cacheFilenameForKey(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${CACHE_FILE_PREFIX}${safe}${CACHE_FILE_EXT}`;
}

function cacheUriForKey(key: string): string {
  return `${getOfflineImageDirUri()}${cacheFilenameForKey(key)}`;
}

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
  } catch {}
  return {};
}

async function writeCacheIndex(index: CacheIndex): Promise<void> {
  const fs = getFs();
  const indexUri = `${getOfflineImageDirUri()}${CACHE_INDEX_FILENAME}`;
  try {
    await fs.writeAsStringAsync(indexUri, JSON.stringify(index));
  } catch {}
}

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
    if (key === null) continue;

    let sizeBytes = persisted[key]?.sizeBytes ?? 0;
    try {
      const info = await fs.getInfoAsync(`${dirUri}${filename}`);
      if (info.exists && typeof info.size === 'number') {
        sizeBytes = info.size;
      }
    } catch {}

    index[key] = {
      sizeBytes,
      lastAccessMs: persisted[key]?.lastAccessMs ?? nowMs,
      createdMs: persisted[key]?.createdMs ?? nowMs,
    };
  }
  return index;
}

export async function getCachedImage(key: string): Promise<string | null> {
  const fs = getFs();
  const fileUri = cacheUriForKey(key);
  try {
    const info = await fs.getInfoAsync(fileUri);
    if (!info.exists) return null;

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
  const existing = omitKeys(await buildCurrentIndex(dirUri, persisted), [key]);

  const nowMs = Date.now();
  const { evictKeys, admit } = selectEvictions(existing, {
    capBytes: IMAGE_CACHE_CAP_BYTES,
    maxAgeMs: IMAGE_CACHE_MAX_AGE_MS,
    nowMs,
    incomingSizeBytes: downloadedSize,
  });

  for (const evictKey of evictKeys) {
    try {
      await fs.deleteAsync(cacheFileUriForEvictedKey(dirUri, evictKey), { idempotent: true });
    } catch {}
  }
  const survivingIndex = omitKeys(existing, evictKeys);

  if (!admit) {
    try {
      await fs.deleteAsync(fileUri, { idempotent: true });
    } catch {}
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

function cacheFileUriForEvictedKey(dirUri: string, evictKey: string): string {
  return `${dirUri}${cacheFilenameForKey(evictKey)}`;
}

function omitKeys(index: CacheIndex, keys: readonly string[]): CacheIndex {
  const removed = new Set(keys);
  const next: CacheIndex = {};
  for (const [k, entry] of Object.entries(index)) {
    if (!removed.has(k)) next[k] = entry;
  }
  return next;
}
