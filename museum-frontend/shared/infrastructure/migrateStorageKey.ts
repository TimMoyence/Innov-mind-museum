import { storage } from '@/shared/infrastructure/storage';

export const migrateStorageKey = async (newKey: string, legacyKey: string): Promise<void> => {
  try {
    const existing = await storage.getItem(newKey);
    if (existing !== null && existing.length > 0) {
      return;
    }

    const legacyValue = await storage.getItem(legacyKey);
    if (legacyValue === null || legacyValue.length === 0) {
      return;
    }

    await storage.setItem(newKey, legacyValue);
    await storage.removeItem(legacyKey);
  } catch {}
};
