import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { storage } from '@/shared/infrastructure/storage';
import type { CityId } from './cityCatalog';

export interface OfflinePackChoice {
  decision: 'accepted' | 'declined';
  /** ISO 8601 timestamp of when the user made the choice. */
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
    (set, get) => ({
      choices: {},

      acceptOfflinePack: (cityId) =>
        set((state) => ({
          choices: {
            ...state.choices,
            [cityId]: { decision: 'accepted', recordedAt: new Date().toISOString() },
          },
        })),

      declineOfflinePack: (cityId) =>
        set((state) => ({
          choices: {
            ...state.choices,
            [cityId]: { decision: 'declined', recordedAt: new Date().toISOString() },
          },
        })),

      getChoice: (cityId) => get().choices[cityId],

      clearChoice: (cityId) =>
        set((state) => {
          const { [cityId]: _removed, ...rest } = state.choices;
          return { choices: rest };
        }),
    }),
    {
      name: 'musaium-offline-pack-choice',
      storage: createJSONStorage(() => storage),
      version: 1,
    },
  ),
);
