import { useCallback, useEffect, useState } from 'react';

import { storage } from '@/shared/infrastructure/storage';

export const SOTTO_VOCE_STORAGE_KEY = 'settings.sotto_voce_mode';

export function useSottoVoce() {
  const [enabled, setEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void storage
      .getItem(SOTTO_VOCE_STORAGE_KEY)
      .then((value) => {
        if (!cancelled) {
          setEnabled(value === 'true');
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(async () => {
    const next = !enabled;
    setEnabled(next);
    await storage.setItem(SOTTO_VOCE_STORAGE_KEY, String(next));
  }, [enabled]);

  return { enabled, isLoading, toggle };
}
