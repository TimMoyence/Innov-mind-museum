import { useCallback, useEffect, useState } from 'react';
import * as Sentry from '@sentry/react-native';

import { consentApi } from '@/features/chat/infrastructure/consentApi';
import { consentStorageService } from '@/features/chat/infrastructure/consentStorageService';
import type { ThirdPartyAiScope } from '@/features/chat/domain/consentScopes';

/**
 * Back-compat re-export — `AuthContext.clearPerUserFeatureStorage` and
 * `SettingsAiConsentCard.onToggle(REQUIRED_CONSENT_SCOPE → off)` continue to
 * import `clearConsentAcceptedFlag` from this module. The canonical
 * implementation lives in
 * `@/features/chat/infrastructure/consentStorageService` ; this re-export
 * keeps the import path stable so unrelated consumers/tests don't change.
 */
export { clearConsentAcceptedFlag } from '@/features/chat/infrastructure/consentStorageService';

/**
 * AI consent modal state. Persists a local "accepted" flag via
 * `consentStorageService` (per-userId namespaced) so the consent sheet does
 * not re-open every cold start, AND — when explicit scopes are supplied —
 * performs the BE round-trip that materialises a row in `user_consents` + a
 * hash-chained `CONSENT_GRANTED_THIRD_PARTY_AI` audit row per scope.
 *
 * S4-P0-02 (Apple Guideline 5.1.2(i)) — the legacy single-button accept
 * (no scopes) is preserved for back-compat with existing test mocks, but the
 * production sheet now ALWAYS calls `acceptAiConsent(scopes)` with the
 * per-category × per-provider set so the granular consent gesture is
 * provable from the audit chain.
 *
 * Failure handling : per-scope BE failures are caught and reported to Sentry
 * (tags : flow=consent.grant, scope) WITHOUT aborting the remaining grants.
 * The storage flag still flips so the user is not re-prompted on every cold
 * start — the canonical record lives server-side in `user_consents`, the
 * AsyncStorage flag is a UX-only "we already asked you" memo.
 *
 * C1 hexagonal (2026-05-23) — application-layer hook ; storage goes through
 * `consentStorageService`, network goes through `consentApi`. No direct
 * `AsyncStorage` / `httpRequest` imports.
 */
export const useAiConsent = () => {
  const [showAiConsent, setShowAiConsent] = useState(false);
  const [consentResolved, setConsentResolved] = useState(false);

  useEffect(() => {
    consentStorageService
      .readAccepted()
      .then((v) => {
        if (v !== 'true') setShowAiConsent(true);
      })
      .catch(() => {
        // consentStorageService already captured the exception to Sentry
        // (tag flow=consent.read) ; we just need to flip the prompt on.
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
          await consentApi.grant(scope);
        } catch (grantError) {
          Sentry.captureException(grantError, {
            tags: { flow: 'consent.grant', scope },
          });
        }
      }
    }
    await consentStorageService.setAccepted();
    setShowAiConsent(false);
  }, []);

  const recheckConsent = useCallback(() => {
    consentStorageService
      .readAccepted()
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
