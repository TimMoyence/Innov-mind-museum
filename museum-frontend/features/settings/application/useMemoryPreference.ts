import { useCallback, useEffect, useState } from 'react';

import { openApiRequest, type OpenApiJsonRequestBodyFor } from '@/shared/api/openapiClient';

type MemoryPatchBody = OpenApiJsonRequestBodyFor<'/api/chat/memory/preference', 'patch'>;

/**
 * Manages the AI memory (personalization) toggle state with backend API calls.
 * Reads current preference on mount and provides a toggle callback.
 */
export const useMemoryPreference = () => {
  const [enabled, setEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void openApiRequest({
      path: '/api/chat/memory/preference',
      method: 'get',
    })
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
        const body: MemoryPatchBody = { enabled: value };
        const res = await openApiRequest({
          path: '/api/chat/memory/preference',
          method: 'patch',
          body: JSON.stringify(body),
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
