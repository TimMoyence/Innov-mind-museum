import { storage } from '@/shared/infrastructure/storage';

import { DISMISSED_KEY, SAVED_ARTWORKS_KEY } from './useDailyArt';

export const clearDailyArtStorage = async (): Promise<void> => {
  await Promise.all([
    storage.removeItem(SAVED_ARTWORKS_KEY).catch(() => undefined),
    storage.removeItem(DISMISSED_KEY).catch(() => undefined),
  ]);
};
