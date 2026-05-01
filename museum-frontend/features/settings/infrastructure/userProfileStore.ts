import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { storage } from '@/shared/infrastructure/storage';
import type { ContentPreference } from '@/shared/types/content-preference';

/**
 * User profile store — currently holds content preferences only.
 *
 * @remarks
 * This store follows the local-first pattern used across `runtimeSettingsStore`,
 * `dataModeStore`, and the audio description preference: Zustand persist is the
 * device source of truth, writes are optimistically saved locally and
 * eventually consistent with the backend via dedicated PATCH endpoints.
 *
 * **Cross-device limitation (known):** this store is NOT hydrated from
 * `GET /me` after login. A user who changes preferences on device A will see
 * empty toggles on a fresh install of device B until they re-toggle. This is
 * consistent with how every other runtime setting behaves. A future refactor
 * should introduce a unified `bootstrapProfile()` call that hydrates all
 * local-first stores from `/me` on app start.
 *
 * **Forward-looking naming:** the store is called `userProfile` (not
 * `contentPreferences`) because future profile fields (displayName, avatar,
 * notification settings) will live here.
 */
interface UserProfileState {
  /** Persisted content preferences (cached from the backend). */
  contentPreferences: ContentPreference[];
  /** True once the store has been hydrated from device storage. */
  _hydrated: boolean;
  /** True once the user has completed (or dismissed) the onboarding flow. */
  hasSeenOnboarding: boolean;

  /** Replace the full preferences array (used after a successful PATCH). */
  setContentPreferences: (preferences: ContentPreference[]) => void;
  /** Toggle a single preference on/off. Returns the new array. */
  toggleContentPreference: (preference: ContentPreference) => ContentPreference[];
  /** Clear all preferences. */
  clearContentPreferences: () => void;
  /** Mark onboarding as seen (or reset it for testing/re-onboarding). */
  setHasSeenOnboarding: (value: boolean) => void;
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
    }),
    {
      name: 'musaium.userProfile',
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
