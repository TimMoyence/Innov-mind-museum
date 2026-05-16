import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { grantConsentScope, type ThirdPartyAiScope } from './thirdPartyAiConsent';

const CONSENT_KEY = 'consent.ai_accepted';

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
 * provable from the audit chain. Per-scope BE failures are swallowed (best
 * effort) — AsyncStorage still flips so the user is not re-prompted ; the
 * next launch's reconcile pass can retry.
 */
export const useAiConsent = () => {
  const [showAiConsent, setShowAiConsent] = useState(false);
  const [consentResolved, setConsentResolved] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(CONSENT_KEY)
      .then((v) => {
        if (v !== 'true') setShowAiConsent(true);
      })
      .catch(() => {
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
      // chain ordering deterministic ; an individual scope failure does not
      // abort the remaining grants nor the AsyncStorage write.
      for (const scope of grantedScopes) {
        try {
          await grantConsentScope(scope);
        } catch {
          // Best effort — surfacing per-scope errors would defeat the purpose
          // of the gate (user already gave consent in the UI). A reconcile job
          // can retry missing scopes from the next /api/auth/consent fetch.
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
