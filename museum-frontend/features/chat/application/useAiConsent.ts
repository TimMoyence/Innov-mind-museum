import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';

import { grantConsentScope, type ThirdPartyAiScope } from './thirdPartyAiConsent';

const CONSENT_KEY = 'consent.ai_accepted';

/**
 * Clear the local "user has been asked + answered" memo. Called from the
 * Settings revoke surface when the user withdraws the mandatory text scope
 * — the BE state then says "not granted", so the next chat mount MUST
 * re-prompt rather than honour the stale local flag. Failure is non-fatal
 * (worst case = sheet doesn't re-prompt, user can revoke again).
 */
export const clearConsentAcceptedFlag = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(CONSENT_KEY);
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
    AsyncStorage.getItem(CONSENT_KEY)
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
      await AsyncStorage.setItem(CONSENT_KEY, 'true');
    } catch {
      // Persist failure is non-blocking — modal will re-appear next session
    }
    setShowAiConsent(false);
  }, []);

  const recheckConsent = useCallback(() => {
    AsyncStorage.getItem(CONSENT_KEY)
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
