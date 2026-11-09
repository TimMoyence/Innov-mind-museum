import { useEffect } from 'react';

import { loadRuntimeSettings } from '@/features/settings/runtimeSettings';
import { useRuntimeSettingsStore } from '@/features/settings/infrastructure/runtimeSettingsStore';
import { useI18n } from '@/shared/i18n/I18nContext';

export const useRuntimeSettings = () => {
  const { language } = useI18n();
  const defaultMuseumMode = useRuntimeSettingsStore((s) => s.defaultMuseumMode);
  const guideLevel = useRuntimeSettingsStore((s) => s.guideLevel);
  const hydrated = useRuntimeSettingsStore((s) => s._hydrated);
  const setAll = useRuntimeSettingsStore((s) => s.setAll);

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
    locale: language,
    museumMode: defaultMuseumMode,
    guideLevel,
    isLoading: !hydrated,
  };
};
