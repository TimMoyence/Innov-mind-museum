import AsyncStorage from '@react-native-async-storage/async-storage';

/** Thin wrapper around AsyncStorage providing typed get/set, JSON serialization, and a uniform API. */
export const storage = {
  async getItem(key: string): Promise<string | null> {
    return AsyncStorage.getItem(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    return AsyncStorage.setItem(key, value);
  },
  async removeItem(key: string): Promise<void> {
    return AsyncStorage.removeItem(key);
  },
  async getJSON<T>(key: string): Promise<T | null> {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch (_e) {
      return null;
    }
  },
  async setJSON(key: string, value: unknown): Promise<void> {
    return AsyncStorage.setItem(key, JSON.stringify(value));
  },
};
