import { storage } from '@/shared/infrastructure/storage';

import { DISMISSED_KEY, SAVED_ARTWORKS_KEY } from './useDailyArt';

/**
 * Purges every AsyncStorage key owned by the daily-art feature.
 * MUST be called at logout and on forced sign-out (401) to prevent user A's
 * saved artworks or dismissal state from leaking into user B's session on a
 * shared device.
 *
 * Idempotent: safe to call when no keys are present.
 */
export const clearDailyArtStorage = async (): Promise<void> => {
  await Promise.all([
    storage.removeItem(SAVED_ARTWORKS_KEY).catch(() => undefined),
    storage.removeItem(DISMISSED_KEY).catch(() => undefined),
  ]);
};
