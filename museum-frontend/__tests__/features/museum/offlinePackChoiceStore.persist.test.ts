/**
 * Tests for the zustand-persist config of {@link useOfflinePackChoiceStore}
 * (TD-ZUS-02). The store currently lacks a `partialize` option, so when the
 * persist middleware serializes the store envelope it forwards the FULL
 * state object (`{ choices, acceptOfflinePack, declineOfflinePack, getChoice,
 * clearChoice }`) to its merge / hydrate logic. JSON.stringify happens to
 * drop function refs, so the on-disk shape is JSON-identical to the
 * `partialize`d form — but the EXPECTED persisted state input (pre-JSON)
 * still contains the actions. Spec R10 + design D5 mandate
 * `partialize: (s) => ({ choices: s.choices })` so the persisted slice is
 * explicitly narrowed; this protects the disk payload from future
 * non-serializable additions to the store shape.
 *
 * lib-docs cite: lib-docs/zustand/PATTERNS.md:119,206 ; lib-docs/zustand/LESSONS.md F2.
 *
 * RED contract: this test asserts on `useOfflinePackChoiceStore.persist.getOptions().partialize`
 * which is `undefined` against the current source (no partialize set). Once
 * GREEN adds the option, the function exists and produces `{ choices }`-only
 * output.
 */
import '@/__tests__/helpers/test-utils';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockStorage = new Map<string, string>();

jest.mock('@/shared/infrastructure/storage', () => ({
  storage: {
    getItem: jest.fn((key: string) => Promise.resolve(mockStorage.get(key) ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      mockStorage.set(key, value);
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      mockStorage.delete(key);
      return Promise.resolve();
    }),
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

import { useOfflinePackChoiceStore } from '@/features/museum/infrastructure/offlinePackChoiceStore';

// ── Helpers ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'musaium-offline-pack-choice';

const flushPersist = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('offlinePackChoiceStore — persist config (TD-ZUS-02)', () => {
  beforeEach(() => {
    mockStorage.clear();
    useOfflinePackChoiceStore.setState({ choices: {} });
  });

  it('declares a partialize option that narrows persisted state to { choices } only', () => {
    const options = useOfflinePackChoiceStore.persist.getOptions();

    // Partialize MUST be set (spec R10, design D5). Without it, the persisted
    // payload includes the full store shape (action functions only stripped
    // implicitly by JSON.stringify — fragile and undocumented).
    expect(typeof options.partialize).toBe('function');

    // Apply partialize to a representative state snapshot and assert the
    // produced slice contains exactly `choices` (no actions).
    const fullState = useOfflinePackChoiceStore.getState();
    const partialize = options.partialize as (state: typeof fullState) => Record<string, unknown>;
    const slice = partialize(fullState);

    expect(Object.keys(slice).sort()).toEqual(['choices']);
    expect(Object.prototype.hasOwnProperty.call(slice, 'acceptOfflinePack')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(slice, 'declineOfflinePack')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(slice, 'getChoice')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(slice, 'clearChoice')).toBe(false);
  });

  it('keeps version: 1 (preserved, not bumped)', () => {
    const options = useOfflinePackChoiceStore.persist.getOptions();
    expect(options.version).toBe(1);
  });

  it('persists the choice payload on accept (smoke check round-trip)', async () => {
    useOfflinePackChoiceStore.getState().acceptOfflinePack('paris');

    await flushPersist();

    const raw = mockStorage.get(STORAGE_KEY);
    expect(raw).toBeDefined();
    if (raw === undefined) throw new Error('Expected persisted state to be defined');
    const parsed = JSON.parse(raw) as {
      state: { choices: Record<string, { decision: string; recordedAt: string }> };
      version: number;
    };

    expect(parsed.version).toBe(1);
    expect(parsed.state.choices.paris?.decision).toBe('accepted');
    expect(typeof parsed.state.choices.paris?.recordedAt).toBe('string');
  });
});
