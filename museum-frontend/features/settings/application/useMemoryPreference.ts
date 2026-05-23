import { useCallback, useEffect, useState } from 'react';

import { memoryPreferenceApi } from '@/features/settings/infrastructure/memoryPreferenceApi';

/**
 * Manages the AI memory (personalization) toggle state with backend API calls.
 * Reads current preference on mount and provides a toggle callback.
 *
 * C1 hexagonal (2026-05-23) — wire calls go through
 * `features/settings/infrastructure/memoryPreferenceApi` ; this application
 * hook no longer reaches into the shared transport primitives directly.
 */
export const useMemoryPreference = () => {
  const [enabled, setEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void memoryPreferenceApi
      .get()
      .then((res) => {
        if (!cancelled) {
          setEnabled(res.enabled);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(
    async (value: boolean) => {
      const previous = enabled;
      setEnabled(value);
      try {
        const res = await memoryPreferenceApi.update(value);
        setEnabled(res.enabled);
      } catch {
        setEnabled(previous);
      }
    },
    [enabled],
  );

  return { enabled, isLoading, toggle };
};
