import { useCallback } from 'react';
import { Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { reportError } from '@/shared/observability/errorReporting';

/**
 * TD-SEC-02 (R3–R7) — disable screen capture/recording while a secret-bearing
 * screen (e.g. `MfaEnrollScreen`, displaying the live TOTP secret + recovery
 * codes) is focused, and re-enable it the moment the screen loses focus or
 * unmounts.
 *
 * Doctrine (lib-docs/expo-screen-capture/PATTERNS.md "CRITICAL doctrine"):
 *  - Use the IMPERATIVE `preventScreenCaptureAsync` / `allowScreenCaptureAsync`
 *    pair driven by `useFocusEffect` — NOT the `usePreventScreenCapture` hook.
 *    The lib hook releases on UNMOUNT only; under an Expo Router stack a parked
 *    screen stays mounted, so the lib hook would leave capture disabled while
 *    the user is on another screen (the RN persistent-host gotcha). The
 *    `useFocusEffect` cleanup fires on BLUR and unmount, keeping prevent/allow
 *    balanced (R4/R7 — no residual Android black screen).
 *  - Lazy/web-safe guarded require, mirroring `authTokenStore.ts:26-37`: no
 *    top-level static import (would crash on web/Jest/missing native module —
 *    PR #258 SIGABRT lesson). Web / module-absent => silent no-op (R5/R6).
 *  - Each native call is wrapped: a failure is routed through `reportError`
 *    with NO secret in the payload, never surfaced as a crash (R6).
 *  - A distinct, named `key` ('mfa-secret') so a concurrent feature's `allow`
 *    cannot clobber this screen's `prevent` (keyed reference tracking).
 */

const SCREEN_CAPTURE_KEY = 'mfa-secret';

interface ScreenCaptureModule {
  preventScreenCaptureAsync: (key?: string) => Promise<void>;
  allowScreenCaptureAsync: (key?: string) => Promise<void>;
}

const loadScreenCapture = (): ScreenCaptureModule | null => {
  if (Platform.OS === 'web') {
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy load for test isolation / web-safe native module
    return require('expo-screen-capture') as ScreenCaptureModule;
  } catch {
    return null;
  }
};

/**
 * Prevents screen capture while the calling screen is focused, restoring it on
 * blur/unmount. No-op on web / when the native module is absent.
 */
export function usePreventScreenCapture(): void {
  useFocusEffect(
    useCallback(() => {
      const screenCapture = loadScreenCapture();

      if (screenCapture) {
        screenCapture.preventScreenCaptureAsync(SCREEN_CAPTURE_KEY).catch((error: unknown) => {
          // NEVER include the secret in the payload — only the operation context.
          reportError(error, { op: 'screenCapture.prevent', key: SCREEN_CAPTURE_KEY });
        });
      }

      return () => {
        if (screenCapture) {
          screenCapture.allowScreenCaptureAsync(SCREEN_CAPTURE_KEY).catch((error: unknown) => {
            reportError(error, { op: 'screenCapture.allow', key: SCREEN_CAPTURE_KEY });
          });
        }
      };
    }, []),
  );
}
