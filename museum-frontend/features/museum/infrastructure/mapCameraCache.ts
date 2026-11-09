import { storage } from '@/shared/infrastructure/storage';
import { migrateStorageKey } from '@/shared/infrastructure/migrateStorageKey';

const STORAGE_KEY = 'musaium.museum.lastCameraView.v1';
const LEGACY_STORAGE_KEY = 'museum.lastCameraView.v1';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

const SAVE_DEBOUNCE_MS = 1000;

interface StoredCamera {
  centerLng: number;
  centerLat: number;
  zoom: number;
  storedAt: number;
}

export interface CachedCamera {
  centerLng: number;
  centerLat: number;
  zoom: number;
}

interface CameraView {
  centerLng: number;
  centerLat: number;
  zoom: number;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const mapCameraCache = {
  save(view: CameraView, isUserInteraction = true): void {
    if (!isUserInteraction) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      const payload: StoredCamera = {
        centerLng: view.centerLng,
        centerLat: view.centerLat,
        zoom: view.zoom,
        storedAt: Date.now(),
      };
      void storage.setJSON(STORAGE_KEY, payload).catch(() => undefined);
    }, SAVE_DEBOUNCE_MS);
  },

  async load(): Promise<CachedCamera | null> {
    await migrateStorageKey(STORAGE_KEY, LEGACY_STORAGE_KEY);
    let raw: StoredCamera | null;
    try {
      raw = await storage.getJSON<StoredCamera>(STORAGE_KEY);
    } catch {
      return null;
    }
    if (!raw) return null;
    if (
      !isFiniteNumber(raw.centerLng) ||
      !isFiniteNumber(raw.centerLat) ||
      !isFiniteNumber(raw.zoom) ||
      !isFiniteNumber(raw.storedAt)
    ) {
      return null;
    }
    if (Date.now() - raw.storedAt > TTL_MS) return null;
    return {
      centerLng: raw.centerLng,
      centerLat: raw.centerLat,
      zoom: raw.zoom,
    };
  },

  async clear(): Promise<void> {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    try {
      await storage.removeItem(STORAGE_KEY);
    } catch {}
  },
};
