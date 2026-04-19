import * as SecureStore from 'expo-secure-store';

import { reportError } from '@/shared/observability/errorReporting';

const STORAGE_KEY = 'musaium.offlineMaps.autoPreCacheEnabled';

/**
 * Persistence layer for the "auto pre-cache on geofence entry" setting. Uses
 * `expo-secure-store` to keep the flag encrypted at rest — not because the
 * value is secret, but so the app-wide preference pattern stays uniform with
 * auth tokens and matches the project's `feedback_product_first` rule.
 */
export const offlineMapsPreferences = {
  async isAutoPreCacheEnabled(): Promise<boolean> {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      return raw === 'true';
    } catch (error) {
      reportError(error, {
        component: 'offlineMapsPreferences',
        action: 'read',
      });
      return false;
    }
  },

  async setAutoPreCacheEnabled(enabled: boolean): Promise<void> {
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, enabled ? 'true' : 'false');
    } catch (error) {
      reportError(error, {
        component: 'offlineMapsPreferences',
        action: 'write',
      });
    }
  },
};
