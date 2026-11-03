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
import {
  loadRuntimeSettings,
  saveDefaultLocale,
  saveDefaultMuseumMode,
  saveGuideLevel,
} from '@/features/settings/runtimeSettings';

const mockStore = (storage as unknown as { _store: Map<string, string> })._store;

describe('loadRuntimeSettings', () => {
  beforeEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
  });

  it('returns defaults when storage is empty', async () => {
    const settings = await loadRuntimeSettings();

    expect(settings.defaultLocale).toBe('en-US');
    expect(settings.defaultMuseumMode).toBe(true);
    expect(settings.guideLevel).toBe('beginner');
  });

  it('loads saved values from storage', async () => {
    mockStore.set('musaium.runtime.defaultLocale', 'fr-FR');
    mockStore.set('musaium.runtime.defaultMuseumMode', 'false');
    mockStore.set('musaium.runtime.guideLevel', 'expert');

    const settings = await loadRuntimeSettings();

    expect(settings.defaultLocale).toBe('fr-FR');
    expect(settings.defaultMuseumMode).toBe(false);
    expect(settings.guideLevel).toBe('expert');
  });
});

describe('save functions', () => {
  beforeEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
  });

  it('saveDefaultLocale persists locale', async () => {
    await saveDefaultLocale('fr-FR');
    expect(storage.setItem).toHaveBeenCalledWith('musaium.runtime.defaultLocale', 'fr-FR');
  });

  it('saveDefaultLocale falls back to default for empty string', async () => {
    await saveDefaultLocale('  ');
    expect(storage.setItem).toHaveBeenCalledWith('musaium.runtime.defaultLocale', 'en-US');
  });

  it('saveDefaultMuseumMode persists boolean as string', async () => {
    await saveDefaultMuseumMode(false);
    expect(storage.setItem).toHaveBeenCalledWith('musaium.runtime.defaultMuseumMode', 'false');
  });

  it('saveGuideLevel persists level', async () => {
    await saveGuideLevel('expert');
    expect(storage.setItem).toHaveBeenCalledWith('musaium.runtime.guideLevel', 'expert');
  });
});
