import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { storage } from '@/shared/infrastructure/storage';

/**
 * Audio description toggle store (TD-2 Option B refactor 2026-05-15).
 *
 * Replaces the prior `useAudioDescriptionMode` `useState` + direct AsyncStorage
 * implementation with a proper Zustand-persist store mirroring the pattern of
 * `dataModeStore` / `runtimeSettingsStore`. The legacy storage key
 * (`settings.audio_description_mode`, plain `'true'/'false'`) is NOT migrated:
 * Zustand persist owns its own key (`musaium.audioDescription`, JSON-encoded).
 * Visitors who toggled the legacy preference in V0.x will see it default-false
 * on first launch — R7 accepted limitation, documented in the TD-2 spec.
 *
 * `mergeFromServer` is the cross-device hydration entry-point called by
 * `bootstrapProfile()` after a successful `GET /auth/me`. It sets the local
 * value to the server value when the server payload contains a boolean,
 * silently ignores any other shape (R5 schema tolerance).
 */
interface AudioDescriptionState {
  /** Whether audio description (auto-TTS on AI replies) is enabled. */
  enabled: boolean;
  /** True once the store has been hydrated from device storage. */
  _hydrated: boolean;
  /** Set the enabled flag explicitly. */
  setEnabled: (value: boolean) => void;
  /** Flip the enabled flag. */
  toggle: () => void;
  /**
   * Merge the server-side preference into the local store (server-wins-first
   * per session — R3). No-op when the server payload is missing or not a
   * boolean.
   */
  mergeFromServer: (server: { audioDescriptionMode?: boolean }) => void;
}

export const useAudioDescriptionStore = create<AudioDescriptionState>()(
  persist(
    (set, get) => ({
      enabled: false,
      _hydrated: false,
      setEnabled: (value) => set({ enabled: value }),
      toggle: () => set({ enabled: !get().enabled }),
      mergeFromServer: (server) => {
        if (typeof server.audioDescriptionMode === 'boolean') {
          set({ enabled: server.audioDescriptionMode });
        }
      },
    }),
    {
      name: 'musaium.audioDescription',
      storage: createJSONStorage(() => storage),
      version: 1,
      partialize: (state) => ({ enabled: state.enabled }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state._hydrated = true;
        }
      },
    },
  ),
);
