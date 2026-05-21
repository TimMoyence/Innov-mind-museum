import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';

import { extractUserIdFromToken } from '@/features/auth/domain/authLogic.pure';
import { getAccessToken } from '@/features/auth/infrastructure/authTokenStore';

import { grantConsentScope, type ThirdPartyAiScope } from './thirdPartyAiConsent';

/**
 * Per-userId namespaced "user has been asked + answered" memo key (B8, design
 * §9 D2). TD-AS-01 convention (`musaium.<feature>.<key>`, lib-docs
 * `@react-native-async-storage/async-storage/LESSONS.md:F1`). The userId is
 * derived from the access token (`extractUserIdFromToken(getAccessToken())`).
 *
 * Namespacing closes the GDPR Art. 7 cross-user inheritance defect: on a shared
 * device, user A's acceptance lives under A's key and CANNOT suppress user B's
 * prompt (B reads B's namespace, which is absent → re-prompt). No token →
 * `__anon` namespace (treated as not-asked → safe re-prompt). The legacy global
 * `consent.ai_accepted` key is intentionally NEVER consulted — a device
 * carrying only the legacy key re-prompts under the fresh namespace (R10
 * migration tolerance), and no value is inherited across users.
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

/**
 * Clear the local "user has been asked + answered" memo for the CURRENT user's
 * namespace. Called from the Settings revoke surface when the user withdraws
 * the mandatory text scope, AND from the auth logout / forced-logout cascade
 * (`AuthContext.clearPerUserFeatureStorage`) so the next user on a shared device
 * is re-prompted (B8/R6). The BE state then says "not granted", so the next
 * chat mount MUST re-prompt rather than honour the stale local flag. Failure is
 * non-fatal (worst case = sheet doesn't re-prompt, user can revoke again).
 */
export const clearConsentAcceptedFlag = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(consentMemoKey());
  } catch (err: unknown) {
    Sentry.captureException(err, { tags: { flow: 'consent.clear' } });
  }
};

/**
 * AI consent modal state. Persists a local "accepted" flag in AsyncStorage so
 * the consent sheet does not re-open every cold start, AND — when explicit
 * scopes are supplied — performs the BE round-trip that materialises a row in
 * `user_consents` + a hash-chained `CONSENT_GRANTED_THIRD_PARTY_AI` audit row
 * per scope.
 *
 * S4-P0-02 (Apple Guideline 5.1.2(i)) — the legacy single-button accept
 * (no scopes) is preserved for back-compat with existing test mocks, but the
 * production sheet now ALWAYS calls `acceptAiConsent(scopes)` with the
 * per-category × per-provider set so the granular consent gesture is
 * provable from the audit chain.
 *
 * Failure handling : per-scope BE failures are caught and reported to Sentry
 * (tags : flow=consent.grant, scope) WITHOUT aborting the remaining grants.
 * AsyncStorage still flips so the user is not re-prompted on every cold
 * start — the canonical record lives server-side in `user_consents`, the
 * AsyncStorage flag is a UX-only "we already asked you" memo.
 */
export const useAiConsent = () => {
  const [showAiConsent, setShowAiConsent] = useState(false);
  const [consentResolved, setConsentResolved] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(consentMemoKey())
      .then((v) => {
        if (v !== 'true') setShowAiConsent(true);
      })
      .catch((err: unknown) => {
        // Previously swallowed silently — surface to Sentry so AsyncStorage
        // read failures (native-module init drift, etc.) stop hiding behind
        // the re-prompt-on-next-session UX.
        Sentry.captureException(err, { tags: { flow: 'consent.read' } });
        setShowAiConsent(true);
      })
      .finally(() => {
        setConsentResolved(true);
      });
  }, []);

  const acceptAiConsent = useCallback(async (grantedScopes?: readonly ThirdPartyAiScope[]) => {
    if (grantedScopes && grantedScopes.length > 0) {
      // S4-P0-02 — emit one BE round-trip per granted scope so every grant
      // gets its own hash-chained audit row. Sequential awaits keep the audit
      // chain ordering deterministic ; an individual scope failure is logged
      // to Sentry (so DPO drift dashboards surface AsyncStorage vs BE divergence)
      // but does not abort the remaining grants.
      for (const scope of grantedScopes) {
        try {
          await grantConsentScope(scope);
        } catch (grantError) {
          Sentry.captureException(grantError, {
            tags: { flow: 'consent.grant', scope },
          });
        }
      }
    }
    try {
      await AsyncStorage.setItem(consentMemoKey(), 'true');
    } catch {
      // Persist failure is non-blocking — modal will re-appear next session
    }
    setShowAiConsent(false);
  }, []);

  const recheckConsent = useCallback(() => {
    AsyncStorage.getItem(consentMemoKey())
      .then((v) => {
        if (v !== 'true') setShowAiConsent(true);
      })
      .catch(() => {
        setShowAiConsent(true);
      });
  }, []);

  return {
    showAiConsent,
    setShowAiConsent,
    consentResolved,
    acceptAiConsent,
    recheckConsent,
  };
};
