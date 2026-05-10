import { useCallback, useEffect, useState } from 'react';

import { authStorage } from '@/features/auth/infrastructure/authTokenStore';
import { getBiometricEnabled } from '@/features/auth/infrastructure/biometricStore';
import { runAuthRefresh } from '@/shared/infrastructure/httpClient';

import { useBiometricAuth } from './useBiometricAuth';

interface UseFaceIdSessionRestoreResult {
  /** True once the precondition checks have completed (refresh token + pref). */
  isReady: boolean;
  /**
   * True when there's a stored refresh token AND biometric is enabled AND
   * the device supports biometric. Drives whether the auth screen renders
   * the "Continue with Face ID" affordance.
   */
  canRestore: boolean;
  /** Human-readable label of the device's biometric kind ("Face ID", "Touch ID", …). */
  biometricLabel: string;
  /**
   * Prompts the OS biometric dialog and, on success, runs the silent refresh
   * to re-establish the session. Returns true iff both steps succeed.
   */
  restore: () => Promise<boolean>;
}

/**
 * F11-mobile (2026-05) — auth-screen Face ID affordance.
 *
 * The bootstrap path in {@link AuthContext} already auto-restores a session
 * when a refresh token is present, but in some edge cases (the user lands on
 * the auth screen with a stored refresh token still around) we want to give
 * them a one-tap "Continue with Face ID" option instead of forcing a full
 * password / Google round-trip.
 *
 * The hook composes three primitives:
 *   1. {@link useBiometricAuth} — OS biometric availability + prompt.
 *   2. {@link authStorage.getRefreshToken} — local store presence check.
 *   3. {@link getBiometricEnabled} — user preference flag.
 *
 * `canRestore` is true only when all three line up. The `restore()` action
 * gates a {@link runAuthRefresh} call behind a successful biometric prompt.
 */
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
    const result = await runAuthRefresh();
    return result.kind === 'success';
  }, [biometric]);

  return {
    isReady,
    canRestore,
    biometricLabel: biometric.biometricLabel,
    restore,
  };
};
