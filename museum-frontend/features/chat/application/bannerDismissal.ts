import { storage } from '@/shared/infrastructure/storage';

const readDismissedUntil = async (key: string): Promise<string | null> => {
  try {
    return await storage.getItem(key);
  } catch {
    return null;
  }
};

export const isBannerDismissed = async (key: string): Promise<boolean> => {
  const until = await readDismissedUntil(key);
  const untilMs = until ? new Date(until).getTime() : Number.NaN;
  return !Number.isNaN(untilMs) && Date.now() < untilMs;
};

export const dismissBanner = async (key: string, durationMs: number): Promise<boolean> => {
  try {
    await storage.setItem(key, new Date(Date.now() + durationMs).toISOString());
    return true;
  } catch {
    return false;
  }
};
