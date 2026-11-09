import * as SecureStore from 'expo-secure-store';

import { reportError } from '@/shared/observability/errorReporting';

const STORAGE_KEY = 'musaium.offlineMaps.autoPreCacheEnabled';

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
