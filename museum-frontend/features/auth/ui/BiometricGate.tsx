import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Sentry from '@sentry/react-native';

import { useAuth } from '@/features/auth/application/AuthContext';
import { useBiometricAuth } from '@/features/auth/application/useBiometricAuth';
import { BiometricLockScreen } from '@/features/auth/ui/BiometricLockScreen';
import { authSessionService } from '@/features/auth/infrastructure/authSessionService';

const breadcrumb = (message: string, data?: Record<string, unknown>): void => {
  try {
    Sentry.addBreadcrumb({
      category: 'auth.biometric',
      level: 'info',
      message,
      data,
    });
  } catch {
    /* Sentry may not be initialised in tests */
  }
};

/**
 * Renders {@link BiometricLockScreen} as a gate in front of `children`
 * when the auth context reports the session is biometric-locked.
 *
 * UX contract:
 *   - On mount (and only once per locked session), the biometric prompt
 *     fires automatically — the user opens the app and Face ID / Touch ID
 *     pops up immediately. No manual tap required for the happy path.
 *   - If the OS prompt is cancelled or the match fails, the lock screen
 *     stays visible and exposes a retry button so the user can try again
 *     without backgrounding the app.
 *   - Once {@link useAuth.unlockBiometric} flips the gate, this component
 *     renders its children directly.
 */
export function BiometricGate({ children }: { children: ReactNode }) {
  const { isBiometricLocked, unlockBiometric } = useAuth();
  const { authenticate, biometricLabel } = useBiometricAuth();
  const [failed, setFailed] = useState(false);
  const autoPromptedRef = useRef(false);
  const isLockedRef = useRef(isBiometricLocked);

  useEffect(() => {
    isLockedRef.current = isBiometricLocked;
  }, [isBiometricLocked]);

  // Pure orchestration: triggers the OS prompt, validates the backend
  // session via a preflight refresh, and updates the failed state ONLY
  // on the failure tail. The success branch never calls setState
  // (unlockBiometric ultimately changes auth context, which unmounts
  // this gate). Keeping the synchronous prefix free of setState
  // satisfies react-hooks/set-state-in-effect on the auto-prompt path.
  //
  // Why preflight refresh: Face ID success only proves the user owns the
  // device — it says nothing about whether the server-side refresh token
  // is still valid. Without this check, we unlock the client, navigate to
  // home, and the first authed request takes a 401 → silent refresh →
  // potential invalid → unauthorizedHandler kicks back to /auth. The user
  // experiences "Face ID does nothing." Running the refresh here makes
  // the auth state authoritative before we drop the gate, and surfaces a
  // backend-rejected session as a direct logout (visible breadcrumb).
  const tryUnlock = useCallback(async (): Promise<void> => {
    breadcrumb('prompt');
    const success = await authenticate();
    if (!success) {
      breadcrumb('failed');
      setFailed(true);
      return;
    }

    breadcrumb('refresh_preflight');
    const refresh = await authSessionService.refresh();
    breadcrumb('refresh_result', { kind: refresh.kind });

    // `invalid` → unauthorizedHandler already cleared the session and
    // queued a navigate to /auth. We still unlock so the gate stops
    // covering the Stack and the auth screen becomes visible.
    // `transient` (network / 5xx) → unlock so the user can keep using
    // the app offline; the next online request will retry the refresh.
    // `success` → tokens are fresh, navigation will land on home.
    if (isLockedRef.current) {
      breadcrumb('unlocked', { refresh: refresh.kind });
      unlockBiometric();
      return;
    }
    breadcrumb('stale_unlock_skipped');
  }, [authenticate, unlockBiometric]);

  // Auto-prompt on mount when the session enters the locked state.
  // Tracked via a ref so a re-render of the gate does not spawn a second
  // OS prompt while the first is still on-screen.
  useEffect(() => {
    if (!isBiometricLocked) {
      autoPromptedRef.current = false;
      return;
    }
    if (autoPromptedRef.current) return;
    autoPromptedRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: auto-prompt fires the OS biometric dialog on mount; setFailed is only reached after an awaited authenticate() rejection (microtask), not synchronously inside the effect body.
    void tryUnlock();
  }, [isBiometricLocked, tryUnlock]);

  const handleRetry = useCallback((): void => {
    setFailed(false);
    void tryUnlock();
  }, [tryUnlock]);

  if (!isBiometricLocked) {
    return <>{children}</>;
  }

  return (
    <BiometricLockScreen biometricLabel={biometricLabel} onUnlock={handleRetry} failed={failed} />
  );
}
