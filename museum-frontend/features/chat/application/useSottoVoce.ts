import { useCallback, useEffect, useState } from 'react';

import { storage } from '@/shared/infrastructure/storage';

export const SOTTO_VOCE_STORAGE_KEY = 'settings.sotto_voce_mode';

/**
 * B5 — Manages the sotto-voce mode toggle (silent-room: text-only, no TTS)
 * with AsyncStorage persistence cross-session.
 *
 * Mirror exact of `useAudioDescriptionMode` :
 * - `enabled === true` → screen MUST gate `useAutoTts.enabled` to `false`.
 * - Persistence : AsyncStorage key `settings.sotto_voce_mode` via shared
 *   `storage` façade (zero new dep).
 * - Read failure is non-fatal — falls back to `enabled = false`.
 *
 * Spec : `docs/chat-ux-refonte/specs/B5.md` §1.1 (R1-R8) + §2.2.
 */
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
