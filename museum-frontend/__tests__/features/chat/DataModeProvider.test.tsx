/**
 * TR-02 + TR-06 — resolveDataMode 3-arg matrix + DataModeProvider wiring (run
 * undefined-network-detection-reliability, cluster A, task A-R4 — rewrite of
 * the contractually invalidated test #1, spec §10).
 *
 * Contract evolution (documented, not a frozen-test breach): the former case
 * « returns low when auto + connection is expensive » ratified the trigger bug
 * (iOS marks ALL cellular expensive ⇒ healthy 5G punished). Under the new
 * contract `isConnectionExpensive` is the COST axis (`metered`) and NEVER
 * resolves `low` in auto (INV-01/INV-02); quality drives the resolution
 * (INV-05), passed as an explicit 3rd argument (INV-18).
 */
import type React from 'react';
import type { NetInfoState } from '@react-native-community/netinfo';

// ── NetInfo mock ────────────────────────────────────────────────────────────
let mockNetInfoState = {
  type: 'wifi',
  isConnected: true,
  isInternetReachable: true,
  details: { isConnectionExpensive: false },
} as unknown as Partial<NetInfoState>;

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  useNetInfo: () => mockNetInfoState,
  NetInfoStateType: {
    unknown: 'unknown',
    none: 'none',
    cellular: 'cellular',
    wifi: 'wifi',
    bluetooth: 'bluetooth',
    ethernet: 'ethernet',
    wimax: 'wimax',
    vpn: 'vpn',
    other: 'other',
  },
  NetInfoCellularGeneration: {
    '2g': '2g',
    '3g': '3g',
    '4g': '4g',
    '5g': '5g',
  },
  default: {
    addEventListener: jest.fn(() => jest.fn()),
    fetch: jest.fn(),
    refresh: jest.fn(),
    configure: jest.fn(),
    useNetInfo: () => mockNetInfoState,
    useNetInfoInstance: jest.fn(),
  },
}));

// ── Zustand store mock ──────────────────────────────────────────────────────
let mockPreference: 'auto' | 'low' | 'normal' = 'auto';
const mockSetPreference = jest.fn((p: 'auto' | 'low' | 'normal') => {
  mockPreference = p;
});

jest.mock('@/features/settings/dataModeStore', () => ({
  useDataModePreferenceStore: (
    selector: (s: { preference: string; setPreference: typeof mockSetPreference }) => unknown,
  ) => selector({ preference: mockPreference, setPreference: mockSetPreference }),
}));

// ── AsyncStorage mock (required by Zustand persist) ─────────────────────────
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// ── networkQualityTracker mock — quality is an injected external store ──────
type MockQualityState = 'unknown' | 'ok' | 'slow';
let mockQualityState: MockQualityState = 'unknown';
const mockQualityListeners = new Set<(s: MockQualityState) => void>();
const mockNoteNetworkIdentity = jest.fn();

// Non-virtual mock keyed by the RESOLVED module path (the module exists on
// disk since the green phase). Virtual registration keys an extensionless
// synthetic ID in the per-worker shared `_moduleIDCache`; once another suite
// resolves the REAL file first, the virtual mock silently stops binding in
// full-suite runs (order-dependent failures). Resolving through the `@/`
// alias normalizes every importer to the same module ID.
jest.mock('@/shared/infrastructure/connectivity/networkQualityTracker', () => ({
  getQualityState: () => mockQualityState,
  subscribeQualityState: (listener: (s: MockQualityState) => void) => {
    mockQualityListeners.add(listener);
    return () => mockQualityListeners.delete(listener);
  },
  noteNetworkIdentity: (...args: unknown[]) => mockNoteNetworkIdentity(...args),
  recordQualitySample: jest.fn(),
}));

import { act, renderHook } from '@testing-library/react-native';
import {
  DataModeProvider,
  useDataMode,
  resolveDataMode,
  deriveMetered,
} from '@/features/chat/application/DataModeProvider';
import {
  getCurrentDataMode,
  __resetDataModeForTests,
} from '@/shared/infrastructure/dataMode/currentDataMode';
import { makeNetInfoSnapshot } from '@/__tests__/helpers/factories/connectivity.factories';

const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <DataModeProvider>{children}</DataModeProvider>
);

/** Flips the mocked tracker state and notifies subscribers (transition). */
const emitQuality = (state: MockQualityState): void => {
  mockQualityState = state;
  act(() => {
    mockQualityListeners.forEach((listener) => {
      listener(state);
    });
  });
};

// ── TR-02 — pure resolver matrix ────────────────────────────────────────────

describe('resolveDataMode (pure, 3-arg — INV-18)', () => {
  describe('INV-01 — isConnectionExpensive NEVER resolves low in auto', () => {
    it('auto + wifi + expensive + quality ok ⇒ NORMAL (the 2026-06 trigger bug cannot exist)', () => {
      const snapshot = makeNetInfoSnapshot({
        type: 'wifi',
        isConnectionExpensive: true,
        cellularGeneration: null,
      });
      expect(resolveDataMode('auto', snapshot, 'ok')).toBe('normal');
    });

    it('auto + wifi-metered (Android hotspot) + quality unknown ⇒ normal (US-02.6)', () => {
      const snapshot = makeNetInfoSnapshot({
        type: 'wifi',
        isConnectionExpensive: true,
        cellularGeneration: null,
      });
      expect(resolveDataMode('auto', snapshot, 'unknown')).toBe('normal');
    });

    it.each(['4g', '5g'])(
      'auto + cellular %s + expensive (iOS marks all cellular) + quality ok ⇒ normal (US-01.1)',
      (gen) => {
        const snapshot = makeNetInfoSnapshot({
          type: 'cellular',
          cellularGeneration: gen,
          isConnectionExpensive: true,
        });
        expect(resolveDataMode('auto', snapshot, 'ok')).toBe('normal');
      },
    );

    it('auto + cellular gen null + expensive ⇒ normal (US-01.3 — 5G on iOS < 14.1)', () => {
      const snapshot = makeNetInfoSnapshot({
        type: 'cellular',
        cellularGeneration: null,
        isConnectionExpensive: true,
      });
      expect(resolveDataMode('auto', snapshot, 'unknown')).toBe('normal');
    });
  });

  describe('INV-04 — 2g/3g label short-circuits to low, quality cannot cancel it (D-03)', () => {
    it.each([
      ['2g', 'ok'],
      ['2g', 'unknown'],
      ['2g', 'slow'],
      ['3g', 'ok'],
      ['3g', 'unknown'],
      ['3g', 'slow'],
    ] as const)('auto + cellular %s + quality %s ⇒ low', (gen, quality) => {
      const snapshot = makeNetInfoSnapshot({
        type: 'cellular',
        cellularGeneration: gen,
        isConnectionExpensive: true,
      });
      expect(resolveDataMode('auto', snapshot, quality)).toBe('low');
    });
  });

  describe('INV-05 — in auto, outside offline/2g/3g, low ⇔ quality slow', () => {
    it.each([
      ['wifi', null, false],
      ['cellular', '4g', true],
      ['ethernet', null, false],
    ] as const)('auto + %s + quality slow ⇒ low (US-03.1)', (type, gen, expensive) => {
      const snapshot = makeNetInfoSnapshot({
        type,
        cellularGeneration: gen,
        isConnectionExpensive: expensive,
      });
      expect(resolveDataMode('auto', snapshot, 'slow')).toBe('low');
    });

    it.each([
      ['wifi', null],
      ['cellular', '4g'],
      ['cellular', '5g'],
      ['ethernet', null],
      ['vpn', null],
      ['unknown', null],
    ] as const)('auto + %s/%s + quality ok ⇒ normal', (type, gen) => {
      const snapshot = makeNetInfoSnapshot({ type, cellularGeneration: gen });
      expect(resolveDataMode('auto', snapshot, 'ok')).toBe('normal');
    });

    it('quality unknown is treated as ok — never low by missing data (US-04.4 / INV-08)', () => {
      const snapshot = makeNetInfoSnapshot({ type: 'wifi', cellularGeneration: null });
      expect(resolveDataMode('auto', snapshot, 'unknown')).toBe('normal');
    });

    it('auto + connected + details null ⇒ normal', () => {
      const snapshot = makeNetInfoSnapshot({ type: 'wifi', details: null });
      expect(resolveDataMode('auto', snapshot, 'ok')).toBe('normal');
    });
  });

  describe('offline & cold-start (D-02 / INV-11)', () => {
    it('auto + isConnected false ⇒ low even with quality ok (US-06.1)', () => {
      const snapshot = makeNetInfoSnapshot({
        isConnected: false,
        type: 'none',
        details: null,
      });
      expect(resolveDataMode('auto', snapshot, 'ok')).toBe('low');
    });

    it('cold-start: isConnected null + details null + quality unknown ⇒ normal (INV-11 / US-06.3)', () => {
      const snapshot = makeNetInfoSnapshot({
        isConnected: null,
        isInternetReachable: null,
        type: 'unknown',
        details: null,
      });
      expect(resolveDataMode('auto', snapshot, 'unknown')).toBe('normal');
    });
  });

  describe('INV-03 — explicit preferences beat every network signal', () => {
    it('preference low + perfect wifi + quality ok ⇒ low', () => {
      const snapshot = makeNetInfoSnapshot({ type: 'wifi', cellularGeneration: null });
      expect(resolveDataMode('low', snapshot, 'ok')).toBe('low');
    });

    it('preference low + cold-start nulls ⇒ low', () => {
      const snapshot = makeNetInfoSnapshot({ isConnected: null, details: null });
      expect(resolveDataMode('low', snapshot, 'unknown')).toBe('low');
    });

    it('preference normal + offline + quality slow ⇒ normal', () => {
      const snapshot = makeNetInfoSnapshot({ isConnected: false, type: 'none', details: null });
      expect(resolveDataMode('normal', snapshot, 'slow')).toBe('normal');
    });

    it('preference normal + cellular 2g + quality slow ⇒ normal', () => {
      const snapshot = makeNetInfoSnapshot({
        type: 'cellular',
        cellularGeneration: '2g',
        isConnectionExpensive: true,
      });
      expect(resolveDataMode('normal', snapshot, 'slow')).toBe('normal');
    });
  });
});

// ── deriveMetered — COST axis signal (INV-01 / INV-02) ──────────────────────

describe('deriveMetered (pure)', () => {
  it('returns true when isConnectionExpensive is true (cellular)', () => {
    const snapshot = makeNetInfoSnapshot({ type: 'cellular', isConnectionExpensive: true });
    expect(deriveMetered(snapshot)).toBe(true);
  });

  it('returns true for Android metered wifi (US-02.6)', () => {
    const snapshot = makeNetInfoSnapshot({
      type: 'wifi',
      isConnectionExpensive: true,
      cellularGeneration: null,
    });
    expect(deriveMetered(snapshot)).toBe(true);
  });

  it('returns false when isConnectionExpensive is false', () => {
    const snapshot = makeNetInfoSnapshot({ isConnectionExpensive: false });
    expect(deriveMetered(snapshot)).toBe(false);
  });

  it('returns false when details is null (cold-start, US-02.5)', () => {
    const snapshot = makeNetInfoSnapshot({ isConnected: null, details: null });
    expect(deriveMetered(snapshot)).toBe(false);
  });

  it('returns false when isConnectionExpensive is absent (US-02.5)', () => {
    expect(deriveMetered({ details: {} })).toBe(false);
  });
});

// ── TR-06 — Provider wiring ─────────────────────────────────────────────────

describe('DataModeProvider + useDataMode hook', () => {
  beforeEach(() => {
    mockPreference = 'auto';
    mockNetInfoState = makeNetInfoSnapshot({
      type: 'wifi',
      cellularGeneration: null,
      isConnectionExpensive: false,
    }) as unknown as Partial<NetInfoState>;
    mockQualityState = 'unknown';
    mockQualityListeners.clear();
    __resetDataModeForTests();
    jest.clearAllMocks();
  });

  it('resolves normal with metered false on auto + plain wifi', () => {
    const { result } = renderHook(() => useDataMode(), { wrapper });

    expect(result.current.preference).toBe('auto');
    expect(result.current.resolved).toBe('normal');
    expect(result.current.isLowData).toBe(false);
    expect(result.current.metered).toBe(false);
  });

  it('wifi + expensive ⇒ resolved normal AND metered true (INV-01/INV-02 at provider level)', () => {
    mockNetInfoState = makeNetInfoSnapshot({
      type: 'wifi',
      cellularGeneration: null,
      isConnectionExpensive: true,
    }) as unknown as Partial<NetInfoState>;

    const { result } = renderHook(() => useDataMode(), { wrapper });

    expect(result.current.resolved).toBe('normal');
    expect(result.current.isLowData).toBe(false);
    expect(result.current.metered).toBe(true);
  });

  it('resolves to low on auto + 2G cellular (INV-04 kept)', () => {
    mockNetInfoState = makeNetInfoSnapshot({
      type: 'cellular',
      cellularGeneration: '2g',
    }) as unknown as Partial<NetInfoState>;

    const { result } = renderHook(() => useDataMode(), { wrapper });

    expect(result.current.resolved).toBe('low');
    expect(result.current.isLowData).toBe(true);
  });

  it('resolves to low when the tracker reports slow (INV-05)', () => {
    mockQualityState = 'slow';

    const { result } = renderHook(() => useDataMode(), { wrapper });

    expect(result.current.resolved).toBe('low');
    expect(result.current.isLowData).toBe(true);
  });

  it('re-resolves mid-session on quality transitions without remount (US-03.3)', () => {
    mockQualityState = 'ok';
    const { result } = renderHook(() => useDataMode(), { wrapper });
    expect(result.current.resolved).toBe('normal');

    emitQuality('slow');
    expect(result.current.resolved).toBe('low');

    emitQuality('ok');
    expect(result.current.resolved).toBe('normal');
  });

  it('pushes the network identity to the tracker (US-04.3 wiring)', () => {
    mockNetInfoState = makeNetInfoSnapshot({
      type: 'cellular',
      cellularGeneration: '4g',
    }) as unknown as Partial<NetInfoState>;

    renderHook(() => useDataMode(), { wrapper });

    expect(mockNoteNetworkIdentity).toHaveBeenCalledWith({
      type: 'cellular',
      cellularGeneration: '4g',
      isConnected: true,
    });
  });

  it('pushes a null generation when details is null', () => {
    mockNetInfoState = makeNetInfoSnapshot({
      type: 'wifi',
      details: null,
    }) as unknown as Partial<NetInfoState>;

    renderHook(() => useDataMode(), { wrapper });

    expect(mockNoteNetworkIdentity).toHaveBeenCalledWith({
      type: 'wifi',
      cellularGeneration: null,
      isConnected: true,
    });
  });

  it('mirrors the resolved mode into setCurrentDataMode (header/TTS out-of-React reads)', () => {
    mockNetInfoState = makeNetInfoSnapshot({
      type: 'cellular',
      cellularGeneration: '2g',
    }) as unknown as Partial<NetInfoState>;

    renderHook(() => useDataMode(), { wrapper });

    expect(getCurrentDataMode()).toBe('low');
  });

  it('cold-start nulls resolve normal with metered false — no low flash (INV-11)', () => {
    mockNetInfoState = makeNetInfoSnapshot({
      isConnected: null,
      isInternetReachable: null,
      type: 'unknown',
      details: null,
    }) as unknown as Partial<NetInfoState>;

    const { result } = renderHook(() => useDataMode(), { wrapper });

    expect(result.current.resolved).toBe('normal');
    expect(result.current.metered).toBe(false);
  });

  it('preference low forces low while metered stays derived from the network (INV-02/INV-03)', () => {
    mockPreference = 'low';
    mockNetInfoState = makeNetInfoSnapshot({
      type: 'wifi',
      cellularGeneration: null,
      isConnectionExpensive: true,
    }) as unknown as Partial<NetInfoState>;

    const { result } = renderHook(() => useDataMode(), { wrapper });

    expect(result.current.preference).toBe('low');
    expect(result.current.resolved).toBe('low');
    expect(result.current.isLowData).toBe(true);
    expect(result.current.metered).toBe(true);
  });

  it('resolves to normal when forced normal even if disconnected (INV-03 kept)', () => {
    mockPreference = 'normal';
    mockNetInfoState = makeNetInfoSnapshot({
      isConnected: false,
      type: 'none',
      details: null,
    }) as unknown as Partial<NetInfoState>;

    const { result } = renderHook(() => useDataMode(), { wrapper });

    expect(result.current.preference).toBe('normal');
    expect(result.current.resolved).toBe('normal');
    expect(result.current.isLowData).toBe(false);
  });

  it('exposes setPreference from the store', () => {
    const { result } = renderHook(() => useDataMode(), { wrapper });

    expect(typeof result.current.setPreference).toBe('function');
  });
});
