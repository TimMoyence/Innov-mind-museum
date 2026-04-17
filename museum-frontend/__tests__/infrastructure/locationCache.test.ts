import { locationCache } from '@/features/museum/infrastructure/locationCache';
import { storage } from '@/shared/infrastructure/storage';

describe('locationCache', () => {
  beforeEach(async () => {
    await locationCache.clear();
    jest.useRealTimers();
  });

  it('persists and reloads a position', async () => {
    await locationCache.save({ latitude: 38.7223, longitude: -9.1393 });

    const cached = await locationCache.load();

    expect(cached).not.toBeNull();
    expect(cached?.latitude).toBe(38.7223);
    expect(cached?.longitude).toBe(-9.1393);
    expect(typeof cached?.storedAt).toBe('number');
  });

  it('returns null when nothing is stored', async () => {
    const cached = await locationCache.load();
    expect(cached).toBeNull();
  });

  it('returns null when stored payload is older than 7 days', async () => {
    const eightDaysMs = 8 * 24 * 60 * 60 * 1000;
    const stale = {
      latitude: 48.8566,
      longitude: 2.3522,
      storedAt: Date.now() - eightDaysMs,
    };
    await storage.setJSON('museum.lastKnownPosition.v1', stale);

    const cached = await locationCache.load();

    expect(cached).toBeNull();
  });

  it('returns null when stored payload is malformed', async () => {
    await storage.setJSON('museum.lastKnownPosition.v1', { foo: 'bar' });

    const cached = await locationCache.load();

    expect(cached).toBeNull();
  });

  it('clear() removes the cached position', async () => {
    await locationCache.save({ latitude: 1, longitude: 2 });
    await locationCache.clear();

    const cached = await locationCache.load();

    expect(cached).toBeNull();
  });
});
