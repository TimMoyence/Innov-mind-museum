jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

jest.mock('@/shared/observability/errorReporting', () => ({
  reportError: jest.fn(),
}));

import * as SecureStore from 'expo-secure-store';

import { offlineMapsPreferences } from '@/features/settings/infrastructure/offlineMapsPreferences';

const mockedGet = SecureStore.getItemAsync as jest.Mock;
const mockedSet = SecureStore.setItemAsync as jest.Mock;

beforeEach(() => {
  mockedGet.mockReset();
  mockedSet.mockReset();
});

describe('offlineMapsPreferences', () => {
  it('reads the persisted enabled flag as true when the stored string is "true"', async () => {
    mockedGet.mockResolvedValue('true');
    await expect(offlineMapsPreferences.isAutoPreCacheEnabled()).resolves.toBe(true);
  });

  it('returns false when the value is absent or any other string', async () => {
    mockedGet.mockResolvedValue(null);
    await expect(offlineMapsPreferences.isAutoPreCacheEnabled()).resolves.toBe(false);
    mockedGet.mockResolvedValue('yes');
    await expect(offlineMapsPreferences.isAutoPreCacheEnabled()).resolves.toBe(false);
  });

  it('falls back to false and does not throw when SecureStore reads fail', async () => {
    mockedGet.mockRejectedValue(new Error('keychain locked'));
    await expect(offlineMapsPreferences.isAutoPreCacheEnabled()).resolves.toBe(false);
  });

  it('persists boolean toggles as "true" / "false" strings', async () => {
    mockedSet.mockResolvedValue(undefined);
    await offlineMapsPreferences.setAutoPreCacheEnabled(true);
    expect(mockedSet).toHaveBeenLastCalledWith(expect.any(String), 'true');
    await offlineMapsPreferences.setAutoPreCacheEnabled(false);
    expect(mockedSet).toHaveBeenLastCalledWith(expect.any(String), 'false');
  });
});
