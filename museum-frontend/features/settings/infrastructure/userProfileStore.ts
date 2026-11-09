import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { storage } from '@/shared/infrastructure/storage';
import type { ContentPreference } from '@/shared/types/content-preference';

export const USER_PROFILE_STORAGE_KEY = 'musaium.userProfile';

interface UserProfileState {
  contentPreferences: ContentPreference[];
  _hydrated: boolean;
  hasSeenOnboarding: boolean;

  setContentPreferences: (preferences: ContentPreference[]) => void;
  toggleContentPreference: (preference: ContentPreference) => ContentPreference[];
  clearContentPreferences: () => void;
  setHasSeenOnboarding: (value: boolean) => void;
  mergeFromServer: (server: { contentPreferences?: ContentPreference[] }) => void;
}

export const useUserProfileStore = create<UserProfileState>()(
  persist(
    (set, get) => ({
      contentPreferences: [],
      _hydrated: false,
      hasSeenOnboarding: false,

      setContentPreferences: (preferences) => {
        set({ contentPreferences: preferences });
      },

      toggleContentPreference: (preference) => {
        const current = get().contentPreferences;
        const next = current.includes(preference)
          ? current.filter((p) => p !== preference)
          : [...current, preference];
        set({ contentPreferences: next });
        return next;
      },

      clearContentPreferences: () => {
        set({ contentPreferences: [] });
      },

      setHasSeenOnboarding: (value) => {
        set({ hasSeenOnboarding: value });
      },

      mergeFromServer: (server) => {
        if (Array.isArray(server.contentPreferences)) {
          set({ contentPreferences: server.contentPreferences });
        }
      },
    }),
    {
      name: USER_PROFILE_STORAGE_KEY,
      storage: createJSONStorage(() => storage),
      version: 1,
      partialize: (state) => ({
        contentPreferences: state.contentPreferences,
        hasSeenOnboarding: state.hasSeenOnboarding,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state._hydrated = true;
        }
      },
    },
  ),
);
