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

const flushPersist = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
};

const readHydrated = (): unknown => {
  const state = useDataModePreferenceStore.getState() as unknown as Record<string, unknown>;
  return state._hydrated;
};

describe('dataModeStore — _hydrated gate (parity with userProfileStore) — T2.6 / spec R9 / design D9', () => {
  beforeEach(() => {
    mockStorage.clear();
    useDataModePreferenceStore.setState({ preference: 'auto' });
  });

  it('initial _hydrated === false (store not yet hydrated from device storage)', () => {
    expect(readHydrated()).toBe(false);
  });

  it('_hydrated flips to true after rehydrate (onRehydrateStorage)', async () => {
    await useDataModePreferenceStore.persist.rehydrate();
    await flushPersist();

    expect(readHydrated()).toBe(true);
  });

  it('_hydrated is excluded from the persisted slice (partialize returns only { preference })', () => {
    const options = useDataModePreferenceStore.persist.getOptions();
    const fullState = useDataModePreferenceStore.getState();
    const partialize = options.partialize as (state: typeof fullState) => Record<string, unknown>;
    const slice = partialize(fullState);

    expect(Object.prototype.hasOwnProperty.call(slice, '_hydrated')).toBe(false);
    expect(Object.keys(slice).sort()).toEqual(['preference']);
  });

  it('the persisted blob never contains _hydrated', async () => {
    useDataModePreferenceStore.getState().setPreference('low');
    await flushPersist();

    const raw = mockStorage.get('musaium.dataMode.preference');
    expect(raw).toBeDefined();
    if (raw === undefined) throw new Error('Expected persisted state to be defined');
    const parsed = JSON.parse(raw) as { state: Record<string, unknown> };
    expect(Object.prototype.hasOwnProperty.call(parsed.state, '_hydrated')).toBe(false);
  });
});
