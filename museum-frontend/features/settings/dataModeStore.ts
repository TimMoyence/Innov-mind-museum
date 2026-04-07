import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { storage } from '@/shared/infrastructure/storage';

export type DataModePreference = 'auto' | 'low' | 'normal';

interface DataModePreferenceStore {
  preference: DataModePreference;
  setPreference: (p: DataModePreference) => void;
}

export const useDataModePreferenceStore = create<DataModePreferenceStore>()(
  persist(
    (set) => ({
      preference: 'auto',
      setPreference: (p) => set({ preference: p }),
    }),
    {
      name: 'musaium.dataMode.preference',
      storage: createJSONStorage(() => storage),
    },
  ),
);
