/**
 * Unit tests for mapCameraCache — the persistence layer that remembers the
 * user's last explicit map camera view across sessions. These guard the P0
 * fix: only user-driven moves persist, writes debounce to avoid AsyncStorage
 * thrash, and a stale cache (>30d) is dropped so returning users don't land
 * on a region they'd expect to be re-centered.
 */
import { mapCameraCache } from '@/features/museum/infrastructure/mapCameraCache';
import { storage } from '@/shared/infrastructure/storage';

const STORAGE_KEY = 'museum.lastCameraView.v1';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SAVE_DEBOUNCE_MS = 1000;

const sampleView = { centerLng: 2.3522, centerLat: 48.8566, zoom: 14 };

describe('mapCameraCache', () => {
  beforeEach(async () => {
    // Real timers + clean storage between tests. The debounce timer is
    // module-level so leaving fake timers active leaks state across tests.
    jest.useRealTimers();
    await mapCameraCache.clear();
    jest.restoreAllMocks();
  });

  afterEach(async () => {
    jest.useRealTimers();
    await mapCameraCache.clear();
  });

  describe('save()', () => {
    it('persists the camera view with a `storedAt` timestamp when isUserInteraction=true', async () => {
      jest.useFakeTimers();
      const setJSONSpy = jest.spyOn(storage, 'setJSON');

      mapCameraCache.save(sampleView, true);
      jest.advanceTimersByTime(SAVE_DEBOUNCE_MS);
      // setTimeout callback kicks the (real) storage; flush the pending promise.
      await Promise.resolve();

      expect(setJSONSpy).toHaveBeenCalledTimes(1);
      const [key, payload] = setJSONSpy.mock.calls[0];
      expect(key).toBe(STORAGE_KEY);
      expect(payload).toMatchObject({
        centerLng: sampleView.centerLng,
        centerLat: sampleView.centerLat,
        zoom: sampleView.zoom,
      });
      expect(typeof (payload as { storedAt: number }).storedAt).toBe('number');
    });

    it('skips persistence when isUserInteraction=false (programmatic camera moves)', async () => {
      jest.useFakeTimers();
      const setJSONSpy = jest.spyOn(storage, 'setJSON');

      mapCameraCache.save(sampleView, false);
      jest.advanceTimersByTime(SAVE_DEBOUNCE_MS * 2);
      await Promise.resolve();

      expect(setJSONSpy).not.toHaveBeenCalled();
    });

    it('debounces rapid saves into a single write after 1000ms', async () => {
      jest.useFakeTimers();
      const setJSONSpy = jest.spyOn(storage, 'setJSON');

      mapCameraCache.save({ centerLng: 2.0, centerLat: 48.0, zoom: 10 }, true);
      mapCameraCache.save({ centerLng: 2.1, centerLat: 48.1, zoom: 11 }, true);
      mapCameraCache.save({ centerLng: 2.2, centerLat: 48.2, zoom: 12 }, true);

      // Before the debounce window elapses, nothing is written.
      jest.advanceTimersByTime(SAVE_DEBOUNCE_MS - 1);
      expect(setJSONSpy).not.toHaveBeenCalled();

      jest.advanceTimersByTime(2);
      await Promise.resolve();

      expect(setJSONSpy).toHaveBeenCalledTimes(1);
      // Only the latest view is persisted — earlier calls are coalesced away.
      const [, payload] = setJSONSpy.mock.calls[0];
      expect(payload).toMatchObject({ centerLng: 2.2, centerLat: 48.2, zoom: 12 });
    });
  });

  describe('load()', () => {
    it('returns null when nothing is stored', async () => {
      const cached = await mapCameraCache.load();
      expect(cached).toBeNull();
    });

    it('returns null when the stored payload is older than the 30-day TTL', async () => {
      // Seed storage directly with a stale timestamp to bypass save() debounce.
      const stale = {
        ...sampleView,
        storedAt: Date.now() - TTL_MS - 1_000,
      };
      await storage.setJSON(STORAGE_KEY, stale);

      const cached = await mapCameraCache.load();
      expect(cached).toBeNull();
    });

    it('returns the cached camera view when the payload is within TTL', async () => {
      const fresh = {
        ...sampleView,
        storedAt: Date.now() - 60_000,
      };
      await storage.setJSON(STORAGE_KEY, fresh);

      const cached = await mapCameraCache.load();
      expect(cached).toEqual({
        centerLng: sampleView.centerLng,
        centerLat: sampleView.centerLat,
        zoom: sampleView.zoom,
      });
    });
  });

  describe('clear()', () => {
    it('removes the storage key so subsequent load() returns null', async () => {
      await storage.setJSON(STORAGE_KEY, { ...sampleView, storedAt: Date.now() });
      expect(await mapCameraCache.load()).not.toBeNull();

      await mapCameraCache.clear();

      expect(await mapCameraCache.load()).toBeNull();
    });
  });
});
