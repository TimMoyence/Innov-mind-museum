import { useCallback, useEffect, useState } from 'react';

import { offlineMapsPreferences } from '../infrastructure/offlineMapsPreferences';

interface UseAutoPreCachePreferenceResult {
  enabled: boolean;
  isLoading: boolean;
  setEnabled: (next: boolean) => Promise<void>;
}

/**
 * Hook-level adapter around `offlineMapsPreferences`. Loads the persisted
 * auto pre-cache flag on mount and exposes a setter that writes through to
 * SecureStore. The hook owns the React state so consumers do not have to
 * worry about loading races — the `isLoading` flag indicates the initial
 * read, after which updates are optimistic.
 */
export const useAutoPreCachePreference = (): UseAutoPreCachePreferenceResult => {
  const [enabled, setEnabledState] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void offlineMapsPreferences.isAutoPreCacheEnabled().then((value) => {
      if (!cancelled) {
        setEnabledState(value);
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setEnabled = useCallback(async (next: boolean) => {
    setEnabledState(next);
    await offlineMapsPreferences.setAutoPreCacheEnabled(next);
  }, []);

  return { enabled, isLoading, setEnabled };
};
