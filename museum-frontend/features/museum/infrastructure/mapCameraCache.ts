import { storage } from '@/shared/infrastructure/storage';

const STORAGE_KEY = 'museum.lastCameraView.v1';
/** Cached camera views older than 30 days are discarded so a returning user doesn't land
 * on a stale region they'd likely expect to be re-centered. */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Debounce window for user-interaction writes — avoids thrashing AsyncStorage while panning. */
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

// Module-level debounce timer: restarts on each call so rapid pans coalesce
// into a single AsyncStorage write once the user stops moving.
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const mapCameraCache = {
  /**
   * Persist the camera view. Only user-driven moves are persisted — programmatic
   * fits (search-in-area, data-driven auto-fit) intentionally skip to keep the
   * cached view aligned with the user's last explicit intent.
   */
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
      void storage.setJSON(STORAGE_KEY, payload).catch(() => {
        // AsyncStorage failure is non-fatal — the next session will fall back to GPS/defaults.
      });
    }, SAVE_DEBOUNCE_MS);
  },

  async load(): Promise<CachedCamera | null> {
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
    } catch {
      // ignore
    }
  },
};
