import { useCallback, useEffect, useState } from 'react';

import { authStorage } from '@/features/auth/infrastructure/authTokenStore';
import { getBiometricEnabled } from '@/features/auth/infrastructure/biometricStore';
import { authSessionService } from '@/features/auth/infrastructure/authSessionService';

import { useBiometricAuth } from './useBiometricAuth';

interface UseFaceIdSessionRestoreResult {
  isReady: boolean;
  canRestore: boolean;
  biometricLabel: string;
  restore: () => Promise<boolean>;
}

export const useFaceIdSessionRestore = (): UseFaceIdSessionRestoreResult => {
  const biometric = useBiometricAuth();
  const [hasStoredRefreshToken, setHasStoredRefreshToken] = useState(false);
  const [hasBiometricPreference, setHasBiometricPreference] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [token, pref] = await Promise.all([
          authStorage.getRefreshToken(),
          getBiometricEnabled(),
        ]);
        setHasStoredRefreshToken(token !== null && token.length > 0);
        setHasBiometricPreference(pref);
      } catch {
        setHasStoredRefreshToken(false);
        setHasBiometricPreference(false);
      } finally {
        setIsReady(true);
      }
    })();
  }, []);

  const canRestore = biometric.isAvailable && hasBiometricPreference && hasStoredRefreshToken;

  const restore = useCallback(async (): Promise<boolean> => {
    const ok = await biometric.authenticate();
    if (!ok) return false;
    const result = await authSessionService.refresh();
    return result.kind === 'success';
  }, [biometric]);

  return {
    isReady,
    canRestore,
    biometricLabel: biometric.biometricLabel,
    restore,
  };
};
