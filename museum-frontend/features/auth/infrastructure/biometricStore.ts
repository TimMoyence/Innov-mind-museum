import { storage } from '@/shared/infrastructure/storage';

const KEY = 'auth.biometricEnabled';

export async function getBiometricEnabled(): Promise<boolean> {
  const val = await storage.getItem(KEY);
  return val === 'true';
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await storage.setItem(KEY, String(enabled));
}
