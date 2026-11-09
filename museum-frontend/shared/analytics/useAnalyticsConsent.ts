import { useCallback, useEffect, useRef, useState } from 'react';

import { storage } from '@/shared/infrastructure/storage';

const STORAGE_KEY = 'musaium.analytics.consent';
const VALUE_GRANTED = 'granted';
const VALUE_DENIED = 'denied';

export type AnalyticsConsentStatus = 'unset' | 'granted' | 'denied';

let cachedStatus: AnalyticsConsentStatus = 'unset';

export function hasAnalyticsConsent(): boolean {
  return cachedStatus === 'granted';
}

export function getAnalyticsConsentStatus(): AnalyticsConsentStatus {
  return cachedStatus;
}

export interface AnalyticsConsentHookValue {
  status: AnalyticsConsentStatus;
  granted: boolean;
  grant: () => void;
  decline: () => void;
  revoke: () => void;
}

export function useAnalyticsConsent(): AnalyticsConsentHookValue {
  const [status, setStatus] = useState<AnalyticsConsentStatus>('unset');
  const userActedRef = useRef<boolean>(false);

  useEffect(() => {
    const lifetime = { cancelled: false };
    void (async () => {
      try {
        const stored = await storage.getItem(STORAGE_KEY);
        if (lifetime.cancelled) return;
        if (userActedRef.current) return;
        const next: AnalyticsConsentStatus =
          stored === VALUE_GRANTED ? 'granted' : stored === VALUE_DENIED ? 'denied' : 'unset';
        cachedStatus = next;
        setStatus(next);
      } catch {}
    })();
    return () => {
      lifetime.cancelled = true;
    };
  }, []);

  const choose = useCallback((next: 'granted' | 'denied'): void => {
    userActedRef.current = true;
    cachedStatus = next;
    setStatus(next);
    void storage
      .setItem(STORAGE_KEY, next === 'granted' ? VALUE_GRANTED : VALUE_DENIED)
      .catch(() => undefined);
  }, []);

  const grant = useCallback((): void => {
    choose('granted');
  }, [choose]);

  const decline = useCallback((): void => {
    choose('denied');
  }, [choose]);

  return {
    status,
    granted: status === 'granted',
    grant,
    decline,
    revoke: decline,
  };
}

export function __setAnalyticsConsentForTest(value: boolean): void {
  cachedStatus = value ? 'granted' : 'unset';
}
