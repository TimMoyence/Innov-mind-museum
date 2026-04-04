import { useEffect } from 'react';

import { loadRuntimeSettings } from '@/features/settings/runtimeSettings';
import { useRuntimeSettingsStore } from '@/features/settings/infrastructure/runtimeSettingsStore';

/**
 * Hook that provides runtime settings (locale, museumMode, guideLevel) from the Zustand store.
 * On first mount, loads from AsyncStorage via `loadRuntimeSettings()` and seeds the store.
 * Subsequent calls read directly from the store (no async overhead).
 */
export const useRuntimeSettings = () => {
  const defaultLocale = useRuntimeSettingsStore((s) => s.defaultLocale);
  const defaultMuseumMode = useRuntimeSettingsStore((s) => s.defaultMuseumMode);
  const guideLevel = useRuntimeSettingsStore((s) => s.guideLevel);
  const hydrated = useRuntimeSettingsStore((s) => s._hydrated);
  const setAll = useRuntimeSettingsStore((s) => s.setAll);

  // One-time migration: seed store from legacy AsyncStorage keys (handled by loadRuntimeSettings)
  useEffect(() => {
    if (hydrated) return;
    let cancelled = false;
    void loadRuntimeSettings().then((s) => {
      if (!cancelled) {
        setAll(s);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated, setAll]);

  return {
    locale: defaultLocale,
    museumMode: defaultMuseumMode,
    guideLevel,
    isLoading: !hydrated,
    settings: hydrated ? { defaultLocale, defaultMuseumMode, guideLevel } : null,
  };
};
