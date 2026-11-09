import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { storage } from '@/shared/infrastructure/storage';
import type { CityId } from './cityCatalog';

export interface OfflinePackChoice {
  decision: 'accepted' | 'declined';
  recordedAt: string;
}

interface OfflinePackChoiceState {
  choices: Record<CityId, OfflinePackChoice>;
  acceptOfflinePack: (cityId: CityId) => void;
  declineOfflinePack: (cityId: CityId) => void;
  getChoice: (cityId: CityId) => OfflinePackChoice | undefined;
  clearChoice: (cityId: CityId) => void;
}

export const useOfflinePackChoiceStore = create<OfflinePackChoiceState>()(
  persist(
    (set, get) => {
      const record = (cityId: CityId, decision: OfflinePackChoice['decision']): void => {
        set((state) => ({
          choices: {
            ...state.choices,
            [cityId]: { decision, recordedAt: new Date().toISOString() },
          },
        }));
      };
      return {
        choices: {},

        acceptOfflinePack: (cityId) => {
          record(cityId, 'accepted');
        },

        declineOfflinePack: (cityId) => {
          record(cityId, 'declined');
        },

        getChoice: (cityId) => get().choices[cityId],

        clearChoice: (cityId) =>
          set((state) => {
            const { [cityId]: _removed, ...rest } = state.choices;
            return { choices: rest };
          }),
      };
    },
    {
      name: 'musaium-offline-pack-choice',
      storage: createJSONStorage(() => storage),
      version: 1,
      partialize: (state) => ({ choices: state.choices }),
    },
  ),
);
