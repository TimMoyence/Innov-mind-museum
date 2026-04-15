import { useCallback, useEffect, useState } from 'react';

import { storage } from '@/shared/infrastructure/storage';

const STORAGE_KEY = 'settings.audio_description_mode';

/**
 * Manages the audio description mode toggle state with AsyncStorage persistence.
 * When enabled, AI responses are automatically read aloud via TTS.
 */
export function useAudioDescriptionMode() {
  const [enabled, setEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void storage
      .getItem(STORAGE_KEY)
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
    await storage.setItem(STORAGE_KEY, String(next));
  }, [enabled]);

  return { enabled, isLoading, toggle };
}
