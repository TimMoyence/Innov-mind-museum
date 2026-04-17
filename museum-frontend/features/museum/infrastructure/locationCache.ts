import { storage } from '@/shared/infrastructure/storage';

const STORAGE_KEY = 'museum.lastKnownPosition.v1';
/** Cached positions older than 7 days are considered too stale to use as a hint. */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface StoredPosition {
  latitude: number;
  longitude: number;
  storedAt: number;
}

export interface CachedPosition {
  latitude: number;
  longitude: number;
  storedAt: number;
}

export const locationCache = {
  async save(coords: { latitude: number; longitude: number }): Promise<void> {
    const payload: StoredPosition = {
      latitude: coords.latitude,
      longitude: coords.longitude,
      storedAt: Date.now(),
    };
    try {
      await storage.setJSON(STORAGE_KEY, payload);
    } catch {
      // AsyncStorage failure is non-fatal — the next session will fall back to live GPS.
    }
  },

  async load(): Promise<CachedPosition | null> {
    let raw: StoredPosition | null;
    try {
      raw = await storage.getJSON<StoredPosition>(STORAGE_KEY);
    } catch {
      return null;
    }
    if (!raw) return null;
    if (
      typeof raw.latitude !== 'number' ||
      typeof raw.longitude !== 'number' ||
      typeof raw.storedAt !== 'number'
    ) {
      return null;
    }
    if (Date.now() - raw.storedAt > TTL_MS) return null;
    return raw;
  },

  async clear(): Promise<void> {
    try {
      await storage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  },
};
