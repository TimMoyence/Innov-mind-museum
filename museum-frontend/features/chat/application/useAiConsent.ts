import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CONSENT_KEY = 'consent.ai_accepted';

/**
 * Manages AI consent modal state with AsyncStorage persistence.
 * Returns whether consent is resolved (checked), whether to show the modal,
 * and callbacks to accept or defer consent.
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

  const acceptAiConsent = useCallback(async () => {
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
