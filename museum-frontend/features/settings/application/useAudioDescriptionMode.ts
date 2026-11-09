import { useCallback } from 'react';

import { useAudioDescriptionStore } from '@/features/settings/infrastructure/audioDescriptionStore';

export function useAudioDescriptionMode() {
  const enabled = useAudioDescriptionStore((s) => s.enabled);
  const hydrated = useAudioDescriptionStore((s) => s._hydrated);
  const isLoading = !hydrated;

  const toggle = useCallback(
    (): Promise<Error | null> => useAudioDescriptionStore.getState().toggle(),
    [],
  );

  return { enabled, isLoading, toggle };
}
