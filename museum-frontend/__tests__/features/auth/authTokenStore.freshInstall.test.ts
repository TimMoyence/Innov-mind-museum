/**
 * Fresh-install credential purge (iOS Keychain survives an app-data wipe).
 *
 * On iOS the Keychain is NOT part of the app's data container: it survives an
 * uninstall, a `simctl` data wipe, and Maestro's `launchApp: clearState`. A
 * refresh token left there silently resurrects a session the user believed was
 * gone — reinstalling the app drops you straight back into someone's account.
 * Android's `pm clear` wipes its encrypted store, so the two platforms diverge.
 *
 * The purge therefore keys off AsyncStorage, which IS wiped in all those cases.
 * But it must distinguish TWO ways the install marker can be absent:
 *
 *   1. genuinely fresh container (uninstall / clearState)  ⇒ purge the keychain
 *   2. an install that simply PREDATES the marker           ⇒ adopt it, never purge
 *
 * Conflating them would delete a valid session for every already-installed user
 * on the very update that ships this code. `musaium.userProfile` (the zustand
 * persist key, userProfileStore.ts:84) is the witness: it lives in AsyncStorage,
 * so its presence proves the container is not fresh.
 */

const mockDeleteItemAsync = jest.fn<Promise<void>, [string]>();
const mockStorageGetItem = jest.fn<Promise<string | null>, [string]>();
const mockStorageSetItem = jest.fn<Promise<void>, [string, string]>();

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: (key: string) => mockDeleteItemAsync(key),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked-this-device-only',
}));

jest.mock('@/shared/infrastructure/storage', () => ({
  storage: {
    getItem: (key: string) => mockStorageGetItem(key),
    setItem: (key: string, value: string) => mockStorageSetItem(key, value),
    removeItem: jest.fn(),
  },
}));

import { purgeStaleCredentialsOnFreshInstall } from '@/features/auth/infrastructure/authTokenStore';

const MARKER = 'auth.installMarker';
const PROFILE = 'musaium.userProfile';

/** Drive `storage.getItem` from a plain map of what the container currently holds. */
const containerHolds = (entries: Record<string, string | null>): void => {
  mockStorageGetItem.mockImplementation((key: string) => Promise.resolve(entries[key] ?? null));
};

describe('purgeStaleCredentialsOnFreshInstall', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDeleteItemAsync.mockResolvedValue(undefined);
    mockStorageSetItem.mockResolvedValue(undefined);
  });

  it('purges the stale Keychain tokens when the container is genuinely fresh (uninstall / clearState)', async () => {
    containerHolds({}); // no marker, no profile => nothing survived => fresh

    await purgeStaleCredentialsOnFreshInstall();

    expect(mockDeleteItemAsync).toHaveBeenCalledWith('auth.refreshToken');
    expect(mockDeleteItemAsync).toHaveBeenCalledWith('auth.accessToken');
    expect(mockStorageSetItem).toHaveBeenCalledWith(MARKER, '1');
  });

  it('does NOT purge an existing install that merely predates the marker — it adopts it', async () => {
    // THE regression that matters: on the first update shipping this code, every
    // installed user has no marker but DOES have app data. Purging them would sign
    // out the entire user base exactly once.
    containerHolds({ [PROFILE]: '{"state":{}}' }); // no marker, but app data survived

    await purgeStaleCredentialsOnFreshInstall();

    expect(mockDeleteItemAsync).not.toHaveBeenCalled();
    expect(mockStorageSetItem).toHaveBeenCalledWith(MARKER, '1'); // adopted, never re-checked
  });

  it('does NOT purge when the marker is already present (normal restart / update)', async () => {
    containerHolds({ [MARKER]: '1', [PROFILE]: '{"state":{}}' });

    await purgeStaleCredentialsOnFreshInstall();

    expect(mockDeleteItemAsync).not.toHaveBeenCalled();
    expect(mockStorageSetItem).not.toHaveBeenCalled();
  });

  it('still writes the marker when a Keychain delete fails, so a keychain error cannot strand the user signed out forever', async () => {
    // Without this, a persistent SecureStore error (e.g. errSecMissingEntitlement)
    // would reject before the marker write, so the purge would re-run and re-throw
    // on EVERY launch — a permanent logout loop with no recovery but a reinstall.
    containerHolds({});
    mockDeleteItemAsync.mockRejectedValue(new Error('errSecMissingEntitlement'));

    await expect(purgeStaleCredentialsOnFreshInstall()).resolves.toBeUndefined();

    expect(mockStorageSetItem).toHaveBeenCalledWith(MARKER, '1');
  });

  it('never throws out of bootstrap when storage itself fails, and does not purge on a failed read', async () => {
    // A transient AsyncStorage failure must not sign out a user whose refresh token
    // is perfectly valid: bootstrap awaits this before reading the token.
    mockStorageGetItem.mockRejectedValue(new Error('AsyncStorage unavailable'));

    await expect(purgeStaleCredentialsOnFreshInstall()).resolves.toBeUndefined();

    expect(mockDeleteItemAsync).not.toHaveBeenCalled();
  });
});
