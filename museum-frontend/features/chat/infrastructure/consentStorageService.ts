import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';

import { extractUserIdFromToken } from '@/features/auth/domain/authLogic.pure';
import { getAccessToken } from '@/features/auth/infrastructure/authTokenStore';

/**
 * Per-userId namespaced "user has been asked + answered" memo key (B8, design
 * §9 D2). TD-AS-01 convention (`musaium.<feature>.<key>`, lib-docs
 * `@react-native-async-storage/async-storage/LESSONS.md:F1`). The userId is
 * derived from the access token (`extractUserIdFromToken(getAccessToken())`).
 *
 * Namespacing closes the GDPR Art. 7 cross-user inheritance defect: on a
 * shared device, user A's acceptance lives under A's key and CANNOT suppress
 * user B's prompt (B reads B's namespace, which is absent → re-prompt). No
 * token → `__anon` namespace (treated as not-asked → safe re-prompt). The
 * legacy global `consent.ai_accepted` key is intentionally NEVER consulted
 * — a device carrying only the legacy key re-prompts under the fresh
 * namespace (R10 migration tolerance), and no value is inherited across
 * users.
 *
 * C1 hexagonal (2026-05-23) — extracted from
 * `features/chat/application/useAiConsent.ts`. The `useAiConsent` hook now
 * goes through this service ; `AsyncStorage` is no longer imported directly
 * by any file under `features/chat/{application,ui}/**`.
 */
const ANON_NAMESPACE = '__anon';

const consentMemoKey = (): string => {
  let userId: string | null = null;
  try {
    const token = getAccessToken();
    userId = token ? extractUserIdFromToken(token) : null;
  } catch {
    userId = null;
  }
  return `musaium.consent.aiAccepted.${userId ?? ANON_NAMESPACE}`;
};

export const consentStorageService = {
  /**
   * Reads the per-userId namespaced flag. Returns `'true'` (string) when the
   * user already accepted, `null` otherwise. AsyncStorage failures are
   * surfaced to Sentry (tag `flow: 'consent.read'`) AND re-thrown so the
   * caller (`useAiConsent`) can flip `showAiConsent=true` (default re-prompt).
   */
  async readAccepted(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(consentMemoKey());
    } catch (err: unknown) {
      Sentry.captureException(err, { tags: { flow: 'consent.read' } });
      throw err;
    }
  },

  /**
   * Persists `'true'` under the current user's namespace. Failures are
   * swallowed silently — the canonical record lives server-side in
   * `user_consents` ; the worst case is the modal re-appears next session.
   */
  async setAccepted(): Promise<void> {
    try {
      await AsyncStorage.setItem(consentMemoKey(), 'true');
    } catch {
      // non-blocking — modal will re-appear next session
    }
  },

  /**
   * Clears the namespaced flag (logout cascade, Settings revoke of the
   * required scope). Sentry-capture on failure (tag `flow: 'consent.clear'`)
   * but does NOT re-throw — the worst case is the user is NOT re-prompted
   * on this device.
   */
  async clearAccepted(): Promise<void> {
    try {
      await AsyncStorage.removeItem(consentMemoKey());
    } catch (err: unknown) {
      Sentry.captureException(err, { tags: { flow: 'consent.clear' } });
    }
  },

  /**
   * Test-only helper exposing the derived memo key so assertions can
   * verify per-userId namespacing without re-deriving in every test.
   * NOT for production callers.
   */
  __testMemoKey(): string {
    return consentMemoKey();
  },
};

/**
 * Back-compat re-export — `AuthContext.clearPerUserFeatureStorage` and
 * `SettingsAiConsentCard.onToggle(REQUIRED_CONSENT_SCOPE → off)` import this
 * named function. Preserved here so the migration only touches consumers
 * already in scope C1 (the legacy import path
 * `@/features/chat/application/useAiConsent` continues to expose this name
 * via a one-line re-export).
 */
export const clearConsentAcceptedFlag = (): Promise<void> => consentStorageService.clearAccepted();
