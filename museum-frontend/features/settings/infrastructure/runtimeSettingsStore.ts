import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import type { GuideLevel, RuntimeSettings } from '@/features/settings/runtimeSettings.pure';
import { defaults } from '@/features/settings/runtimeSettings.pure';
import { accountPreference } from '@/features/settings/infrastructure/accountPreference';
import { saveProfilePreferences } from '@/features/settings/infrastructure/userProfileApi';
import { storage } from '@/shared/infrastructure/storage';

const museumModeOnAccount = accountPreference<boolean>((value) =>
  saveProfilePreferences({ defaultMuseumMode: value }),
);
const guideLevelOnAccount = accountPreference<GuideLevel>((value) =>
  saveProfilePreferences({ guideLevel: value }),
);

interface RuntimeSettingsState extends RuntimeSettings {
  _hydrated: boolean;

  setAll: (settings: RuntimeSettings) => void;
  setDefaultMuseumMode: (enabled: boolean) => Promise<Error | null>;
  setGuideLevel: (level: GuideLevel) => Promise<Error | null>;
  mergeFromServer: (
    server: Partial<Pick<RuntimeSettings, 'defaultMuseumMode' | 'guideLevel'>>,
  ) => void;
}

export const useRuntimeSettingsStore = create<RuntimeSettingsState>()(
  persist(
    (set, get) => ({
      ...defaults,
      _hydrated: false,

      setAll: (settings) => set({ ...settings }),

      setDefaultMuseumMode: (enabled) =>
        museumModeOnAccount.write(enabled, get().defaultMuseumMode, (value) => {
          set({ defaultMuseumMode: value });
        }),

      setGuideLevel: (level) =>
        guideLevelOnAccount.write(level, get().guideLevel, (value) => {
          set({ guideLevel: value });
        }),

      mergeFromServer: (server) => {
        const next: Partial<RuntimeSettings> = {};
        if (typeof server.defaultMuseumMode === 'boolean') {
          next.defaultMuseumMode = server.defaultMuseumMode;
          museumModeOnAccount.accept(server.defaultMuseumMode);
        }
        if (
          server.guideLevel === 'beginner' ||
          server.guideLevel === 'intermediate' ||
          server.guideLevel === 'expert'
        ) {
          next.guideLevel = server.guideLevel;
          guideLevelOnAccount.accept(server.guideLevel);
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
