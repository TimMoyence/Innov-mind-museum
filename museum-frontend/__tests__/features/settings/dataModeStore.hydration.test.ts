/**
 * RED test — T2.6 (run 2026-05-21-connectivity-offline-first).
 *
 * Proves `dataModeStore` lacks the `_hydrated` hydration gate that its sibling
 * `userProfileStore` has (userProfileStore.ts:29,53,91-95). Without it,
 * consumers cannot distinguish "store not yet hydrated from device storage"
 * from a persisted `auto` preference (TD-14 race per zustand store map).
 *
 * Spec R9, design §D9. Target (shape-identical to userProfileStore):
 *  - `_hydrated: boolean` in the state, initial `false`;
 *  - `onRehydrateStorage: () => (state) => { if (state) state._hydrated = true }`
 *    flips it to `true` after rehydrate;
 *  - `_hydrated` is EXCLUDED from `partialize` (never persisted).
 *
 * lib-docs cited: zustand PATTERNS.md:91 (boot-time hydration gate pattern,
 * `_hydrated` + onRehydrateStorage), PATTERNS.md:89 (partialize to data subset
 * only), PATTERNS.md:132 (anti-pattern: persisted read at boot WITHOUT a gate
 * = TD-14 race). In-repo parity reference: userProfileStore.ts:87-95.
 *
 * RED contract: all three assertions FAIL before T2.6 — `_hydrated` is
 * `undefined` on the state, and the current `partialize` does not include the
 * field (so the "excluded" assertion is vacuously about a non-existent field;
 * the existence + flip assertions fail outright).
 */
import '@/__tests__/helpers/test-utils';

// ── Mocks ────────────────────────────────────────────────────────────────────
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

/**
 * Reads the runtime `_hydrated` flag without coupling to the store's static
 * type. RED-phase: the field does not exist on `DataModePreferenceStore` yet,
 * so a typed `getState()._hydrated` access would not compile. We read it as a
 * plain runtime property so this file typechecks against the current source.
 */
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
    // A fresh store (no persisted blob, no rehydrate yet) must report _hydrated false.
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
