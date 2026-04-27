import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Sentry from '@sentry/react-native';

import { useAuth } from '@/features/auth/application/AuthContext';
import { useBiometricAuth } from '@/features/auth/application/useBiometricAuth';
import { BiometricLockScreen } from '@/features/auth/ui/BiometricLockScreen';

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

  // Pure orchestration: triggers the OS prompt and updates the failed
  // state ONLY on the failure tail. The success branch never calls
  // setState (unlockBiometric ultimately changes auth context, which
  // unmounts this gate). Keeping the synchronous prefix free of setState
  // satisfies react-hooks/set-state-in-effect on the auto-prompt path.
  const tryUnlock = useCallback(async (): Promise<void> => {
    breadcrumb('prompt');
    const success = await authenticate();
    if (success && isLockedRef.current) {
      breadcrumb('unlocked');
      unlockBiometric();
      return;
    }
    if (success) {
      breadcrumb('stale_unlock_skipped');
      return;
    }
    breadcrumb('failed');
    setFailed(true);
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
