import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import type { GuideLevel, RuntimeSettings } from '@/features/settings/runtimeSettings.pure';
import { defaults } from '@/features/settings/runtimeSettings.pure';
import { storage } from '@/shared/infrastructure/storage';

interface RuntimeSettingsState extends RuntimeSettings {
  /** Whether settings have been hydrated from storage at least once. */
  _hydrated: boolean;

  /** Replace all settings at once (e.g. after initial load or migration). */
  setAll: (settings: RuntimeSettings) => void;
  /** Update the default locale. */
  setDefaultLocale: (locale: string) => void;
  /** Update the default museum mode. */
  setDefaultMuseumMode: (enabled: boolean) => void;
  /** Update the guide expertise level. */
  setGuideLevel: (level: GuideLevel) => void;
  /**
   * Merge the server-side preferences into the local store (TD-2 Option B,
   * server-wins-first per session — R3). Each field is set independently when
   * the server payload contains a typed value; absent/`undefined`/wrong-shape
   * fields are silently skipped (R5 schema tolerance).
   */
  mergeFromServer: (
    server: Partial<Pick<RuntimeSettings, 'defaultLocale' | 'defaultMuseumMode' | 'guideLevel'>>,
  ) => void;
}

export const useRuntimeSettingsStore = create<RuntimeSettingsState>()(
  persist(
    (set) => ({
      ...defaults,
      _hydrated: false,

      setAll: (settings) => set({ ...settings }),

      setDefaultLocale: (locale) => set({ defaultLocale: locale }),

      setDefaultMuseumMode: (enabled) => set({ defaultMuseumMode: enabled }),

      setGuideLevel: (level) => set({ guideLevel: level }),

      mergeFromServer: (server) => {
        const next: Partial<RuntimeSettings> = {};
        if (typeof server.defaultLocale === 'string' && server.defaultLocale.length > 0) {
          next.defaultLocale = server.defaultLocale;
        }
        if (typeof server.defaultMuseumMode === 'boolean') {
          next.defaultMuseumMode = server.defaultMuseumMode;
        }
        if (
          server.guideLevel === 'beginner' ||
          server.guideLevel === 'intermediate' ||
          server.guideLevel === 'expert'
        ) {
          next.guideLevel = server.guideLevel;
        }
        if (Object.keys(next).length > 0) {
          set(next);
        }
      },
    }),
    {
      name: 'musaium.runtimeSettings',
      storage: createJSONStorage(() => storage),
      version: 1,
      partialize: (state) => ({
        defaultLocale: state.defaultLocale,
        defaultMuseumMode: state.defaultMuseumMode,
        guideLevel: state.guideLevel,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state._hydrated = true;
        }
      },
    },
  ),
);
