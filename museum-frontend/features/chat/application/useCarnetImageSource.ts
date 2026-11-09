import { defer } from '@/shared/lib/defer';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getMessageImageUrl } from '@/features/chat/infrastructure/chatApi/image';
import { getCachedImage, cacheRemoteImage } from '@/features/chat/application/offlineImageStorage';

export interface UseCarnetImageSourceArgs {
  readonly messageId: string;
  readonly localDerivativeUri?: string;
  readonly fallbackUrl: string;
}

export interface UseCarnetImageSourceResult {
  readonly uri: string;
}

export function useCarnetImageSource({
  messageId,
  localDerivativeUri,
  fallbackUrl,
}: UseCarnetImageSourceArgs): UseCarnetImageSourceResult {
  const [uri, setUri] = useState<string>(localDerivativeUri ?? fallbackUrl);

  const cancelledRef = useRef(false);
  const isCancelled = useCallback((): boolean => cancelledRef.current, []);

  const runResolve = useCallback(async (): Promise<void> => {
    if (messageId.length === 0) return;
    try {
      const cached = await getCachedImage(messageId);
      if (isCancelled()) return;
      if (cached !== null) {
        setUri(cached);
        return;
      }

      let remoteUrl: string;
      try {
        const signed = await getMessageImageUrl(messageId);
        if (isCancelled()) return;
        remoteUrl = signed.url;
      } catch {
        if (isCancelled()) return;
        setUri(fallbackUrl);
        return;
      }

      const repopulated = await cacheRemoteImage(messageId, remoteUrl);
      if (isCancelled()) return;
      setUri(repopulated ?? remoteUrl);
    } catch {
      if (isCancelled()) return;
      setUri(fallbackUrl);
    }
  }, [messageId, fallbackUrl, isCancelled]);

  useEffect(() => {
    cancelledRef.current = false;
    defer(runResolve);
    return () => {
      cancelledRef.current = true;
    };
  }, [runResolve]);

  return { uri };
}
