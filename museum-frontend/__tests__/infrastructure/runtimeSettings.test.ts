jest.mock('@/shared/infrastructure/storage', () => {
  const store = new Map<string, string>();
  return {
    storage: {
      getItem: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
      setItem: jest.fn((key: string, val: string) => {
        store.set(key, val);
        return Promise.resolve();
      }),
      removeItem: jest.fn((key: string) => {
        store.delete(key);
        return Promise.resolve();
      }),
      _store: store,
    },
  };
});

import { storage } from '@/shared/infrastructure/storage';
import { loadRuntimeSettings } from '@/features/settings/runtimeSettings';

const mockStore = (storage as unknown as { _store: Map<string, string> })._store;

describe('loadRuntimeSettings', () => {
  beforeEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
  });

  it('returns defaults when storage is empty', async () => {
    const settings = await loadRuntimeSettings();

    expect(settings.defaultMuseumMode).toBe(true);
    expect(settings.guideLevel).toBe('beginner');
  });

  it('loads saved values from storage', async () => {
    mockStore.set('musaium.runtime.defaultMuseumMode', 'false');
    mockStore.set('musaium.runtime.guideLevel', 'expert');

    const settings = await loadRuntimeSettings();

    expect(settings.defaultMuseumMode).toBe(false);
    expect(settings.guideLevel).toBe('expert');
  });
});
