import { renderHook, waitFor } from '@testing-library/react-native';

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
