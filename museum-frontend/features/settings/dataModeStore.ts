import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { accountPreference } from '@/features/settings/infrastructure/accountPreference';
import { saveProfilePreferences } from '@/features/settings/infrastructure/userProfileApi';
import { storage } from '@/shared/infrastructure/storage';

export type DataModePreference = 'auto' | 'low' | 'normal';

const dataModeOnAccount = accountPreference<DataModePreference>((value) =>
  saveProfilePreferences({ dataMode: value }),
);

const VALID_DATA_MODES: readonly DataModePreference[] = ['auto', 'low', 'normal'];

interface DataModePreferenceStore {
  preference: DataModePreference;
  _hydrated: boolean;
  setPreference: (p: DataModePreference) => Promise<Error | null>;
  mergeFromServer: (server: { preference?: DataModePreference }) => void;
}

export const useDataModePreferenceStore = create<DataModePreferenceStore>()(
  persist(
    (set, get) => ({
      preference: 'auto',
      _hydrated: false,
      setPreference: (p) =>
        dataModeOnAccount.write(p, get().preference, (value) => {
          set({ preference: value });
        }),
      mergeFromServer: (server) => {
        const candidate = server.preference;
        if (typeof candidate === 'string' && VALID_DATA_MODES.includes(candidate)) {
          set({ preference: candidate });
          dataModeOnAccount.accept(candidate);
        }
      },
    }),
    {
      name: 'musaium.dataMode.preference',
      storage: createJSONStorage(() => storage),
      version: 1,
      partialize: (state) => ({ preference: state.preference }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state._hydrated = true;
        }
      },
    },
  ),
);
