import { Platform } from 'react-native';

import { storage } from '@/shared/infrastructure/storage';

let accessToken = '';

export const setAccessToken = (token: string | null | undefined): void => {
  accessToken = token ?? '';
};

export const getAccessToken = (): string => accessToken;

export const clearAccessToken = (): void => {
  accessToken = '';
};

const REFRESH_TOKEN_KEY = 'auth.refreshToken';
const ACCESS_TOKEN_KEY = 'auth.accessToken';

interface SecureStoreModule {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (
    key: string,
    value: string,
    options?: { keychainAccessible?: unknown },
  ) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
  // iOS keychain accessibility constant read at the call site so the real enum
  // value is used at runtime (TD-SEC-01: device-bound, non-backup-migratable).
  WHEN_UNLOCKED_THIS_DEVICE_ONLY?: unknown;
}

const loadSecureStore = (): SecureStoreModule | null => {
  if (Platform.OS === 'web') {
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy load for test isolation
    return require('expo-secure-store') as SecureStoreModule;
  } catch {
    return null;
  }
};

const secureStore = loadSecureStore();

const secureTokenStore = (key: string) => ({
  async get(): Promise<string | null> {
    if (secureStore) {
      return secureStore.getItemAsync(key);
    }
    return storage.getItem(key);
  },
  async set(token: string): Promise<void> {
    if (secureStore) {
      // TD-SEC-01 (R1, R2): device-bound, non-backup-migratable accessibility
      // class so the JWT access/refresh tokens are never written into the
      // iCloud/iTunes encrypted backup. Reads the constant off the loaded
      // module so the real iOS enum value is used at runtime.
      await secureStore.setItemAsync(key, token, {
        keychainAccessible: secureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      return;
    }
    await storage.setItem(key, token);
  },
  async clear(): Promise<void> {
    if (secureStore) {
      await secureStore.deleteItemAsync(key);
      return;
    }
    await storage.removeItem(key);
  },
});

const refreshTokenStore = secureTokenStore(REFRESH_TOKEN_KEY);
const accessTokenStore = secureTokenStore(ACCESS_TOKEN_KEY);

/**
 * AsyncStorage key proving THIS install has already run the purge below. Lives
 * in `storage` (NOT the Keychain) on purpose — see
 * {@link purgeStaleCredentialsOnFreshInstall}.
 */
const INSTALL_MARKER_KEY = 'auth.installMarker';

/**
 * A key the app has always written to AsyncStorage, long before the marker
 * existed (zustand persist name, `features/settings/infrastructure/userProfileStore.ts`).
 * Its presence proves the data container is NOT fresh — it is the witness that
 * lets us tell "brand-new install" apart from "install that predates the marker".
 */
const LEGACY_APP_DATA_KEY = 'musaium.userProfile';

/**
 * Drops Keychain credentials orphaned by a PREVIOUS install.
 *
 * On iOS the Keychain is not part of the app's data container: it survives an
 * uninstall, a `simctl` data wipe, and Maestro's `launchApp: clearState`. A
 * refresh token left behind there silently resurrects a session the user
 * believed was gone — reinstall the app and you land straight back inside the
 * previous account, past `/auth`. Android's `pm clear` wipes its encrypted
 * store, so the two platforms genuinely diverge here.
 *
 * AsyncStorage IS wiped in all of those cases, which is what makes it a usable
 * witness. But an absent marker has TWO possible meanings, and conflating them
 * is a footgun:
 *
 *   1. the container is genuinely fresh (uninstall / clearState) ⇒ purge;
 *   2. the install simply PREDATES this marker ⇒ adopt it, purge NOTHING.
 *
 * Case 2 is every already-installed user on the first update that ships this
 * code. Treating them as "fresh" would delete a valid session and sign out the
 * entire user base exactly once. {@link LEGACY_APP_DATA_KEY} disambiguates: app
 * data present ⇒ not fresh ⇒ silently adopt.
 *
 * Failure handling is deliberate. Bootstrap awaits this before reading any
 * token, so it must never throw and must never be able to strand a user signed
 * out: each Keychain delete is individually guarded, the marker is written even
 * when a delete failed (otherwise a persistent SecureStore error would re-run
 * the purge on every launch — a permanent logout loop recoverable only by a
 * reinstall), and a storage failure simply means "don't purge this launch".
 */
export const purgeStaleCredentialsOnFreshInstall = async (): Promise<void> => {
  try {
    const marker = await storage.getItem(INSTALL_MARKER_KEY);
    if (marker !== null) {
      return;
    }

    const hasPreExistingAppData = (await storage.getItem(LEGACY_APP_DATA_KEY)) !== null;
    if (!hasPreExistingAppData) {
      await Promise.all([
        refreshTokenStore.clear().catch(() => undefined),
        accessTokenStore.clear().catch(() => undefined),
      ]);
    }

    // Written in BOTH branches (purged and adopted) so this runs exactly once
    // per install, and so a failed delete cannot loop forever.
    await storage.setItem(INSTALL_MARKER_KEY, '1');
  } catch {
    // A storage hiccup must not take down bootstrap, and must not sign out a user
    // whose refresh token is perfectly valid. Skip the purge this launch.
  }
};

/** Persistent storage for auth credentials, using expo-secure-store on native and AsyncStorage on web. */
export const authStorage = {
  async getRefreshToken(): Promise<string | null> {
    return refreshTokenStore.get();
  },
  async setRefreshToken(token: string): Promise<void> {
    return refreshTokenStore.set(token);
  },
  async clearRefreshToken(): Promise<void> {
    return refreshTokenStore.clear();
  },
  async getPersistedAccessToken(): Promise<string | null> {
    return accessTokenStore.get();
  },
  async setPersistedAccessToken(token: string): Promise<void> {
    return accessTokenStore.set(token);
  },
  async clearPersistedAccessToken(): Promise<void> {
    return accessTokenStore.clear();
  },
};
