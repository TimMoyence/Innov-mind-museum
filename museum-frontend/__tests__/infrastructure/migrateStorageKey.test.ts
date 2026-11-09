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
