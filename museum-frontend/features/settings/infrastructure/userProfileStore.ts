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
 * **Cross-device hydration (TD-2 Option B 2026-05-15):** `mergeFromServer` is
 * called by `bootstrapProfile()` after login / session resume so devices see
 * their persisted server-side preferences instead of empty defaults. R3
 * server-wins-first applies on first hydration of the session.
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
  /**
   * Merge the server-side preferences into the local store (server-wins-first
   * per session — R3). No-op when the server payload omits the field or
   * carries a non-array value (R5 schema tolerance).
   */
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
