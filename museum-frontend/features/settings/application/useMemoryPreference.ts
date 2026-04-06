import { useCallback, useEffect, useState } from 'react';

import { httpRequest } from '@/shared/api/httpRequest';

interface MemoryPreferenceResponse {
  enabled: boolean;
}

/**
 * Manages the AI memory (personalization) toggle state with backend API calls.
 * Reads current preference on mount and provides a toggle callback.
 */
export const useMemoryPreference = () => {
  const [enabled, setEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void httpRequest<MemoryPreferenceResponse>('/chat/memory/preference')
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
        const res = await httpRequest<MemoryPreferenceResponse>('/chat/memory/preference', {
          method: 'PATCH',
          body: { enabled: value },
        });
        setEnabled(res.enabled);
      } catch {
        setEnabled(previous);
      }
    },
    [enabled],
  );

  return { enabled, isLoading, toggle };
};
