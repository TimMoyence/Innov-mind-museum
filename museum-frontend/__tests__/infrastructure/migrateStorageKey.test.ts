/**
 * Unit tests for migrateStorageKey — the one-shot legacy→new AsyncStorage key
 * reader introduced by TD-AS-01. When the 10 inconsistent storage keys are
 * re-prefixed to `musaium.<feature>.<key>`, a naive rename would orphan every
 * persisted user preference. This reader copies the legacy value to the new
 * key (only when the new key is empty AND the legacy key holds data) and then
 * drops the legacy key, so no user data is lost across the rename.
 *
 * Contract under test (design.md §4):
 *   1. read newKey
 *   2. if newKey non-null AND non-empty -> RETURN (no-op; idempotent + no overwrite)
 *   3. else read legacyKey
 *   4. if legacyKey null/empty -> RETURN (no-op)
 *   5. else setItem(newKey, legacyValue) then removeItem(legacyKey)
 *
 * AsyncStorage is replaced by a Map-backed module mock (the canonical FE test
 * double, see storage.test.ts / logoutCleanup.test.ts) — a module mock, NOT an
 * inline test entity.
 */
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
      setItem: jest.fn((key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve();
      }),
      removeItem: jest.fn((key: string) => {
        store.delete(key);
        return Promise.resolve();
      }),
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';

import { migrateStorageKey } from '@/shared/infrastructure/migrateStorageKey';

const NEW_KEY = 'musaium.new.key';
const LEGACY_KEY = 'old.key';

describe('migrateStorageKey', () => {
  beforeEach(async () => {
    // Drain both keys + reset spy counters so each test starts from a clean,
    // isolated storage state (the Map is module-level and persists otherwise).
    await AsyncStorage.removeItem(NEW_KEY);
    await AsyncStorage.removeItem(LEGACY_KEY);
    jest.clearAllMocks();
  });

  it('migrates the legacy value to the new key and removes the legacy key', async () => {
    await AsyncStorage.setItem(LEGACY_KEY, 'val');
    jest.clearAllMocks();

    await migrateStorageKey(NEW_KEY, LEGACY_KEY);

    expect(await AsyncStorage.getItem(NEW_KEY)).toBe('val');
    expect(await AsyncStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('is idempotent — a second call performs no further write to the new key', async () => {
    await AsyncStorage.setItem(LEGACY_KEY, 'val');
    await migrateStorageKey(NEW_KEY, LEGACY_KEY);

    jest.clearAllMocks();

    await migrateStorageKey(NEW_KEY, LEGACY_KEY);

    expect(await AsyncStorage.getItem(NEW_KEY)).toBe('val');
    expect(await AsyncStorage.getItem(LEGACY_KEY)).toBeNull();
    // The new key already holds the value, so the reader must short-circuit
    // before writing anything again.
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('is a no-op when the legacy key is absent', async () => {
    await migrateStorageKey(NEW_KEY, LEGACY_KEY);

    expect(await AsyncStorage.getItem(NEW_KEY)).toBeNull();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
  });

  it('does not overwrite an existing new key (legacy left untouched)', async () => {
    await AsyncStorage.setItem(NEW_KEY, 'fresh');
    await AsyncStorage.setItem(LEGACY_KEY, 'stale');
    jest.clearAllMocks();

    await migrateStorageKey(NEW_KEY, LEGACY_KEY);

    expect(await AsyncStorage.getItem(NEW_KEY)).toBe('fresh');
    expect(await AsyncStorage.getItem(LEGACY_KEY)).toBe('stale');
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
  });
});
