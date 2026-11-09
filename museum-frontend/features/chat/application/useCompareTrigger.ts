import { useCallback, useEffect, useRef, useState } from 'react';

import { useCompareImage } from '@/features/chat/application/useCompareImage';

interface RnImage {
  uri: string;
  name: string;
  type: string;
}

export interface UseCompareTriggerParams {
  readonly sessionId: string;
  readonly locale?: 'fr' | 'en';
  readonly reload: () => Promise<void> | void;
}

export interface UseCompareTriggerResult {
  readonly trigger: (image: RnImage) => void;
  readonly isPending: boolean;
  readonly error: string | null;
}

export const useCompareTrigger = ({
  sessionId,
  locale,
  reload,
}: UseCompareTriggerParams): UseCompareTriggerResult => {
  const mutation = useCompareImage({ retry: false });
  const [error, setError] = useState<string | null>(null);

  const sessionIdRef = useRef(sessionId);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const trigger = useCallback(
    (image: RnImage) => {
      setError(null);
      const triggeredFor = sessionId;

      mutation.mutate(
        { image, sessionId, locale },
        {
          onSuccess: () => {
            if (sessionIdRef.current !== triggeredFor) return;
            void reload();
          },
          onError: (err: Error) => {
            if (sessionIdRef.current !== triggeredFor) return;
            setError(err.message);
          },
        },
      );
    },
    [mutation, sessionId, locale, reload],
  );

  return {
    trigger,
    isPending: mutation.isPending,
    error,
  };
};
