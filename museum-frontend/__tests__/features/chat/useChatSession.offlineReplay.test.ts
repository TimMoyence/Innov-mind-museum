/**
 * RED test — T2.4 (run 2026-05-21-connectivity-offline-first).
 *
 * Proves `useChatSession` feeds the RAW `isConnected` from `useConnectivity()`
 * into `useOfflineSync({ isConnected, ... })` (useChatSession.ts:54,77) instead
 * of the canonical `isOnline`. Behind a captive portal
 * (`{isConnected:true, isInternetReachable:false, isOnline:false}`) the chat
 * replay would drain the offline queue into a DEAD network because the raw
 * `isConnected:true` reads as "go".
 *
 * Spec R11 (replay on reconnect, idempotent — no double-send), design §D7.
 * Idempotency itself is guaranteed by `useOfflineSync`'s pop-on-success drain
 * (useOfflineSync.ts:54-79); this task only changes the INPUT SOURCE so the
 * drain is gated on the canonical predicate.
 *
 * Strategy: mock `useOfflineSync` to CAPTURE the `isConnected` arg it receives
 * (state-observable, no private introspection), and mock `useConnectivity` to
 * the tri-state shape. The captive-portal case asserts the captured value is
 * `false` (canonical isOnline) — currently `true` (raw isConnected) → RED.
 *
 * lib-docs cited: @tanstack/react-query PATTERNS.md:181-191 (onlineManager /
 * reconnect replay semantics); @react-native-community/netinfo PATTERNS.md:173.
 *
 * RED contract: the captive-portal case FAILS before T2.4.
 */
import { renderHook, waitFor } from '@testing-library/react-native';

// ── Mocks ────────────────────────────────────────────────────────────────────
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/shared/infrastructure/inAppReview', () => ({
  incrementCompletedSessions: jest.fn(),
  maybeRequestReview: jest.fn(),
}));

jest.mock('@sentry/react-native', () => ({ captureException: jest.fn() }));

const mockGetSession = jest.fn();
jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: {
    getSession: (...args: unknown[]) => mockGetSession(args[0] as string),
    sendMessageSmart: jest.fn(),
    postMessage: jest.fn(),
    postAudioMessage: jest.fn(),
    getMessageImageUrl: jest.fn(),
  },
}));

jest.mock('@/features/settings/application/useRuntimeSettings', () => ({
  useRuntimeSettings: () => ({
    locale: 'en-US',
    museumMode: true,
    guideLevel: 'beginner' as const,
    isLoading: false,
    settings: null,
  }),
}));

// Tri-state connectivity context (post-T2.1).
let mockConnectivity: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  isOnline: boolean;
} = { isConnected: true, isInternetReachable: true, isOnline: true };
jest.mock('@/shared/infrastructure/connectivity/useConnectivity', () => ({
  useConnectivity: () => mockConnectivity,
}));

jest.mock('@/features/chat/application/useOfflineQueue', () => ({
  useOfflineQueue: () => ({
    isOffline: false,
    enqueue: jest.fn(),
    dequeue: jest.fn(),
    peek: jest.fn().mockReturnValue(undefined),
    pendingCount: 0,
  }),
}));

// Capture what value useChatSession passes as `isConnected` to useOfflineSync.
const mockUseOfflineSync = jest.fn();
jest.mock('@/features/chat/application/useOfflineSync', () => ({
  useOfflineSync: (params: { isConnected: boolean }) => mockUseOfflineSync(params),
}));

jest.mock('@/features/chat/application/DataModeProvider', () => ({
  useDataMode: () => ({ isLowData: false }),
}));

const mockCacheLookup = jest.fn().mockReturnValue(null);
const mockCacheStore = jest.fn();
jest.mock('@/features/chat/application/chatLocalCache', () => ({
  useChatLocalCacheStore: (selector: (state: { lookup: jest.Mock; store: jest.Mock }) => unknown) =>
    selector({ lookup: mockCacheLookup, store: mockCacheStore }),
}));

const mockUpdateMessages = jest.fn();
jest.mock('@/features/chat/infrastructure/chatSessionStore', () => {
  const getState = () => ({
    sessions: {},
    setSession: jest.fn(),
    updateMessages: mockUpdateMessages,
  });
  const hook = Object.assign(
    (selector: (state: ReturnType<typeof getState>) => unknown) => selector(getState()),
    { getState },
  );
  return { useChatSessionStore: hook };
});

import { useChatSession } from '@/features/chat/application/useChatSession';

const SESSION_ID = 'replay-session-1';

const lastIsConnectedArg = (): boolean | undefined => {
  const calls = mockUseOfflineSync.mock.calls;
  if (calls.length === 0) return undefined;
  return (calls[calls.length - 1][0] as { isConnected: boolean }).isConnected;
};

describe('useChatSession — feeds canonical isOnline to useOfflineSync — T2.4 / spec R11 / design D7', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConnectivity = { isConnected: true, isInternetReachable: true, isOnline: true };
    mockGetSession.mockResolvedValue({
      session: { title: 'S', museumName: 'Louvre' },
      messages: [],
    });
  });

  it('passes isConnected=true to useOfflineSync when fully online', async () => {
    mockConnectivity = { isConnected: true, isInternetReachable: true, isOnline: true };

    renderHook(() => useChatSession(SESSION_ID));

    await waitFor(() => {
      expect(mockUseOfflineSync).toHaveBeenCalled();
    });
    expect(lastIsConnectedArg()).toBe(true);
  });

  it('passes a FALSE drain gate to useOfflineSync behind a captive portal (no drain into a dead network)', async () => {
    mockConnectivity = { isConnected: true, isInternetReachable: false, isOnline: false };

    renderHook(() => useChatSession(SESSION_ID));

    await waitFor(() => {
      expect(mockUseOfflineSync).toHaveBeenCalled();
    });
    // The value fed to useOfflineSync must be the canonical isOnline (false),
    // NOT the raw isConnected (true).
    expect(lastIsConnectedArg()).toBe(false);
  });

  it('passes a FALSE drain gate when there is no active interface', async () => {
    mockConnectivity = { isConnected: false, isInternetReachable: false, isOnline: false };

    renderHook(() => useChatSession(SESSION_ID));

    await waitFor(() => {
      expect(mockUseOfflineSync).toHaveBeenCalled();
    });
    expect(lastIsConnectedArg()).toBe(false);
  });
});
