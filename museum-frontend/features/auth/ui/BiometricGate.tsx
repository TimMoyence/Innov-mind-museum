import { defer } from '@/shared/lib/defer';
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
  } catch {}
};

export function BiometricGate({ children }: { children: ReactNode }) {
  const { isBiometricLocked, unlockBiometric } = useAuth();
  const { authenticate, biometricLabel } = useBiometricAuth();
  const [failed, setFailed] = useState(false);
  const autoPromptedRef = useRef(false);
  const isLockedRef = useRef(isBiometricLocked);

  useEffect(() => {
    isLockedRef.current = isBiometricLocked;
  }, [isBiometricLocked]);

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

    if (isLockedRef.current) {
      breadcrumb('unlocked', { refresh: refresh.kind });
      unlockBiometric();
      return;
    }
    breadcrumb('stale_unlock_skipped');
  }, [authenticate, unlockBiometric]);

  useEffect(() => {
    if (!isBiometricLocked) {
      autoPromptedRef.current = false;
      return;
    }
    if (autoPromptedRef.current) return;
    autoPromptedRef.current = true;
    defer(tryUnlock);
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
