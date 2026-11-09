import { useCallback, useEffect, useState } from 'react';

import {
  accountPreference,
  settleWrite,
} from '@/features/settings/infrastructure/accountPreference';
import { memoryPreferenceApi } from '@/features/settings/infrastructure/memoryPreferenceApi';

const memoryOnAccount = accountPreference<boolean>((value) =>
  settleWrite(memoryPreferenceApi.update(value), 'memoryPreference.save'),
);

export const useMemoryPreference = () => {
  const [enabled, setEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void memoryPreferenceApi
      .get()
      .then((res) => {
        memoryOnAccount.accept(res.enabled);
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
    (value: boolean): Promise<Error | null> => memoryOnAccount.write(value, enabled, setEnabled),
    [enabled],
  );

  return { enabled, isLoading, toggle };
};
