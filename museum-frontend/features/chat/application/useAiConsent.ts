import { useCallback, useEffect, useState } from 'react';
import * as Sentry from '@sentry/react-native';

import { consentApi } from '@/features/chat/infrastructure/consentApi';
import { consentStorageService } from '@/features/chat/infrastructure/consentStorageService';
import type { ThirdPartyAiScope } from '@/features/chat/domain/consentScopes';

export { clearConsentAcceptedFlag } from '@/features/chat/infrastructure/consentStorageService';

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
        setShowAiConsent(true);
      })
      .finally(() => {
        setConsentResolved(true);
      });
  }, []);

  const acceptAiConsent = useCallback(async (grantedScopes?: readonly ThirdPartyAiScope[]) => {
    if (grantedScopes && grantedScopes.length > 0) {
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
