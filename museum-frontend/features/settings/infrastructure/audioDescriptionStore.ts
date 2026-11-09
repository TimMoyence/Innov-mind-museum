import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { accountPreference } from '@/features/settings/infrastructure/accountPreference';
import { saveProfilePreferences } from '@/features/settings/infrastructure/userProfileApi';
import { storage } from '@/shared/infrastructure/storage';

interface AudioDescriptionState {
  enabled: boolean;
  _hydrated: boolean;
  setEnabled: (value: boolean) => Promise<Error | null>;
  toggle: () => Promise<Error | null>;
  mergeFromServer: (server: { audioDescriptionMode?: boolean }) => void;
}

const audioDescriptionOnAccount = accountPreference<boolean>((value) =>
  saveProfilePreferences({ audioDescriptionMode: value }),
);

export const useAudioDescriptionStore = create<AudioDescriptionState>()(
  persist(
    (set, get) => ({
      enabled: false,
      _hydrated: false,
      setEnabled: (value) =>
        audioDescriptionOnAccount.write(value, get().enabled, (enabled) => {
          set({ enabled });
        }),
      toggle: () => get().setEnabled(!get().enabled),
      mergeFromServer: (server) => {
        if (typeof server.audioDescriptionMode === 'boolean') {
          set({ enabled: server.audioDescriptionMode });
          audioDescriptionOnAccount.accept(server.audioDescriptionMode);
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
