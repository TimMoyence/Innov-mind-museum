import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { storage } from '@/shared/infrastructure/storage';

export type DataModePreference = 'auto' | 'low' | 'normal';

const VALID_DATA_MODES: readonly DataModePreference[] = ['auto', 'low', 'normal'];

interface DataModePreferenceStore {
  preference: DataModePreference;
  /**
   * True once the store has been hydrated from device storage. Lets consumers
   * distinguish "store not yet hydrated" from a persisted `auto` preference
   * (TD-14 race). Shape-identical to `userProfileStore._hydrated`. Runtime-only
   * — excluded from `partialize`, never persisted. lib-docs: zustand
   * PATTERNS.md:91 (boot-time hydration gate), :132 (anti-pattern: persisted
   * read at boot WITHOUT a gate). In-repo parity: userProfileStore.ts:29,91-95.
   */
  _hydrated: boolean;
  setPreference: (p: DataModePreference) => void;
  /**
   * Merge the server-side preference into the local store (TD-2 Option B,
   * server-wins-first per session — R3). Silently ignores invalid enum
   * values or missing field (R5 schema tolerance).
   */
  mergeFromServer: (server: { preference?: DataModePreference }) => void;
}

export const useDataModePreferenceStore = create<DataModePreferenceStore>()(
  persist(
    (set) => ({
      preference: 'auto',
      _hydrated: false,
      setPreference: (p) => set({ preference: p }),
      mergeFromServer: (server) => {
        const candidate = server.preference;
        if (typeof candidate === 'string' && VALID_DATA_MODES.includes(candidate)) {
          set({ preference: candidate });
        }
      },
    }),
    {
      name: 'musaium.dataMode.preference',
      storage: createJSONStorage(() => storage),
      // TD-ZUS-01 / spec R9+R11 / design D4+D5 — first version field; pre-fix
      // unversioned blobs are accepted by zustand v5 hydrate fall-through (no
      // `migrate` fn needed). Narrow persisted shape to `{ preference }` so
      // action references (setPreference / mergeFromServer) stay in-memory only.
      // PATTERNS.md:119,120,206.
      version: 1,
      partialize: (state) => ({ preference: state.preference }),
      // Flip the runtime-only `_hydrated` gate once the persisted blob is merged
      // (parity with userProfileStore.ts:91-95). `_hydrated` is NOT in
      // `partialize`, so it is never written back to storage.
      onRehydrateStorage: () => (state) => {
        if (state) {
          state._hydrated = true;
        }
      },
    },
  ),
);
