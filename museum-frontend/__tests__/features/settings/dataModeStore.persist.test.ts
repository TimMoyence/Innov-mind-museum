import '@/__tests__/helpers/test-utils';

const mockStorage = new Map<string, string>();

jest.mock('@/shared/infrastructure/storage', () => ({
  storage: {
    getItem: jest.fn((key: string) => Promise.resolve(mockStorage.get(key) ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      mockStorage.set(key, value);
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      mockStorage.delete(key);
      return Promise.resolve();
    }),
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

import { useDataModePreferenceStore } from '@/features/settings/dataModeStore';
import type * as DataModeStoreModule from '@/features/settings/dataModeStore';

const STORAGE_KEY = 'musaium.dataMode.preference';

const flushPersist = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
};

describe('dataModeStore — persist config (TD-ZUS-01)', () => {
  beforeEach(() => {
    mockStorage.clear();
    useDataModePreferenceStore.setState({ preference: 'auto' });
  });

  it('declares version: 1 on the persist options (first version field)', () => {
    const options = useDataModePreferenceStore.persist.getOptions();
    expect(options.version).toBe(1);
  });

  it('declares a partialize option that narrows to { preference } only', () => {
    const options = useDataModePreferenceStore.persist.getOptions();
    expect(typeof options.partialize).toBe('function');

    const fullState = useDataModePreferenceStore.getState();
    const partialize = options.partialize as (state: typeof fullState) => Record<string, unknown>;
    const slice = partialize(fullState);

    expect(Object.keys(slice).sort()).toEqual(['preference']);
    expect(Object.prototype.hasOwnProperty.call(slice, 'setPreference')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(slice, 'mergeFromServer')).toBe(false);
  });

  it('writes a versioned envelope with { preference } only on setPreference', async () => {
    useDataModePreferenceStore.getState().setPreference('low');

    await flushPersist();

    const raw = mockStorage.get(STORAGE_KEY);
    expect(raw).toBeDefined();
    if (raw === undefined) throw new Error('Expected persisted state to be defined');
    const parsed = JSON.parse(raw) as { state: Record<string, unknown>; version: number };

    expect(parsed.version).toBe(1);
    expect(parsed.state).toEqual({ preference: 'low' });
  });

  it('rehydrates a pre-fix unversioned blob without crashing (R11 backward compat)', async () => {
    mockStorage.clear();
    mockStorage.set(STORAGE_KEY, JSON.stringify({ state: { preference: 'normal' } }));

    let isolatedStore: typeof useDataModePreferenceStore | null = null;

    jest.isolateModules(() => {
      jest.doMock('@/shared/infrastructure/storage', () => ({
        storage: {
          getItem: jest.fn((key: string) => Promise.resolve(mockStorage.get(key) ?? null)),
          setItem: jest.fn((key: string, value: string) => {
            mockStorage.set(key, value);
            return Promise.resolve();
          }),
          removeItem: jest.fn((key: string) => {
            mockStorage.delete(key);
            return Promise.resolve();
          }),
        },
      }));

      const mod = require('@/features/settings/dataModeStore') as typeof DataModeStoreModule;
      isolatedStore = mod.useDataModePreferenceStore;
    });

    expect(isolatedStore).not.toBeNull();
    const store = isolatedStore as unknown as typeof useDataModePreferenceStore;

    await flushPersist();
    await store.persist.rehydrate();
    await flushPersist();

    expect(store.getState().preference).toBe('normal');
  });
});
