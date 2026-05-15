import { useCallback } from 'react';

import { useAudioDescriptionStore } from '@/features/settings/infrastructure/audioDescriptionStore';

/**
 * Manages the audio description mode toggle state.
 *
 * Compat shim (TD-2 Option B 2026-05-15) — delegates to
 * {@link useAudioDescriptionStore} (Zustand persist + cross-device hydration).
 * Public shape (`{ enabled, isLoading, toggle }`) is preserved verbatim so
 * existing call sites (SettingsAccessibilityCard, useChatSession,
 * chat/[sessionId]) keep working with zero changes.
 *
 * When enabled, AI responses are automatically read aloud via TTS.
 */
export function useAudioDescriptionMode() {
  const enabled = useAudioDescriptionStore((s) => s.enabled);
  const hydrated = useAudioDescriptionStore((s) => s._hydrated);
  const isLoading = !hydrated;

  const toggle = useCallback((): Promise<void> => {
    useAudioDescriptionStore.getState().toggle();
    return Promise.resolve();
  }, []);

  return { enabled, isLoading, toggle };
}
