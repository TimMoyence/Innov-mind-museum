import { useState, useEffect } from 'react';

import {
  GuideLevel,
  loadRuntimeSettings,
  RuntimeSettings,
} from '@/features/settings/runtimeSettings';

/**
 * Hook that loads runtime settings (locale, museumMode, guideLevel) from storage on mount.
 * Replaces the `loadRuntimeSettings().then(...)` pattern duplicated across screens.
 */
export const useRuntimeSettings = () => {
  const [settings, setSettings] = useState<RuntimeSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadRuntimeSettings().then((s) => {
      if (!cancelled) {
        setSettings(s);
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    locale: settings?.defaultLocale ?? 'en-US',
    museumMode: settings?.defaultMuseumMode ?? true,
    guideLevel: (settings?.guideLevel ?? 'beginner') as GuideLevel,
    isLoading,
    settings,
  };
};
