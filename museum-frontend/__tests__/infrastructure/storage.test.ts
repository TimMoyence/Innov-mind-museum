jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((key: string) => Promise.resolve(store[key] ?? null)),
      setItem: jest.fn((key: string, value: string) => {
        store[key] = value;
        return Promise.resolve();
      }),
      removeItem: jest.fn((key: string) => {
        delete store[key];
        return Promise.resolve();
      }),
    },
  };
});

import { storage } from '@/shared/infrastructure/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

describe('storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getItem delegates to AsyncStorage', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('value-123');

    const result = await storage.getItem('myKey');

    expect(AsyncStorage.getItem).toHaveBeenCalledWith('myKey');
    expect(result).toBe('value-123');
  });

  it('setItem delegates to AsyncStorage', async () => {
    await storage.setItem('myKey', 'myValue');

    expect(AsyncStorage.setItem).toHaveBeenCalledWith('myKey', 'myValue');
  });

  it('removeItem delegates to AsyncStorage', async () => {
    await storage.removeItem('myKey');

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('myKey');
  });

  it('getJSON parses stored JSON', async () => {
    const obj = { name: 'test', count: 42 };
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(obj));

    const result = await storage.getJSON('jsonKey');

    expect(result).toEqual(obj);
  });

  it('getJSON returns null for missing key', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);

    const result = await storage.getJSON('missing');

    expect(result).toBeNull();
  });

  it('getJSON returns null for invalid JSON', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('not-json{{{');

    const result = await storage.getJSON('badJson');

    expect(result).toBeNull();
  });

  it('setJSON serializes objects', async () => {
    const obj = { a: 1, b: 'two' };
    await storage.setJSON('jsonKey', obj);

    expect(AsyncStorage.setItem).toHaveBeenCalledWith('jsonKey', JSON.stringify(obj));
  });

  it('getJSON returns null for empty string', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('');

    const result = await storage.getJSON('empty');

    expect(result).toBeNull();
  });
});
