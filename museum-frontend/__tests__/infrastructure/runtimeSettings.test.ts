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

jest.mock('@/shared/infrastructure/apiConfig', () => ({
  resolveInitialApiBaseUrl: jest.fn(() => 'https://api.test.com'),
}));

jest.mock('@/shared/infrastructure/httpClient', () => ({
  setApiBaseUrl: jest.fn(),
}));

import { storage } from '@/shared/infrastructure/storage';
import { setApiBaseUrl } from '@/shared/infrastructure/httpClient';
import {
  loadRuntimeSettings,
  applyRuntimeSettings,
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
    mockStore.set('runtime.defaultLocale', 'fr-FR');
    mockStore.set('runtime.defaultMuseumMode', 'false');
    mockStore.set('runtime.guideLevel', 'expert');

    const settings = await loadRuntimeSettings();

    expect(settings.defaultLocale).toBe('fr-FR');
    expect(settings.defaultMuseumMode).toBe(false);
    expect(settings.guideLevel).toBe('expert');
  });

  it('cleans up legacy API override keys when present', async () => {
    mockStore.set('runtime.apiBaseUrl', 'https://old.api.com');
    mockStore.set('runtime.apiEnvironment', 'staging');

    await loadRuntimeSettings();

    expect(storage.removeItem).toHaveBeenCalledWith('runtime.apiBaseUrl');
    expect(storage.removeItem).toHaveBeenCalledWith('runtime.apiEnvironment');
  });

  it('skips cleanup when no legacy keys exist', async () => {
    await loadRuntimeSettings();

    expect(storage.removeItem).not.toHaveBeenCalled();
  });
});

describe('applyRuntimeSettings', () => {
  beforeEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
  });

  it('loads settings and sets API base URL', async () => {
    const settings = await applyRuntimeSettings();

    expect(settings.defaultLocale).toBe('en-US');
    expect(setApiBaseUrl).toHaveBeenCalledWith('https://api.test.com');
  });
});

describe('save functions', () => {
  beforeEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
  });

  it('saveDefaultLocale persists locale', async () => {
    await saveDefaultLocale('fr-FR');
    expect(storage.setItem).toHaveBeenCalledWith('runtime.defaultLocale', 'fr-FR');
  });

  it('saveDefaultLocale falls back to default for empty string', async () => {
    await saveDefaultLocale('  ');
    expect(storage.setItem).toHaveBeenCalledWith('runtime.defaultLocale', 'en-US');
  });

  it('saveDefaultMuseumMode persists boolean as string', async () => {
    await saveDefaultMuseumMode(false);
    expect(storage.setItem).toHaveBeenCalledWith('runtime.defaultMuseumMode', 'false');
  });

  it('saveGuideLevel persists level', async () => {
    await saveGuideLevel('expert');
    expect(storage.setItem).toHaveBeenCalledWith('runtime.guideLevel', 'expert');
  });
});
