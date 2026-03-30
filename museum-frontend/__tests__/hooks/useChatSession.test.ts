import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useChatSession } from '@/features/chat/application/useChatSession';
import type { ChatUiMessage } from '@/features/chat/application/chatSessionLogic.pure';

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

// chatApi
const mockGetSession = jest.fn<
  Promise<{
    session: { title: string | null; museumName: string | null };
    messages: {
      id: string;
      role: string;
      text: string;
      createdAt: string;
      imageRef?: string | null;
      image?: { url: string; expiresAt: string } | null;
      metadata?: Record<string, unknown> | null;
    }[];
  }>,
  [string]
>();
const mockSendMessageSmart = jest.fn();
const mockPostMessage = jest.fn();
const mockPostAudioMessage = jest.fn();
const mockGetMessageImageUrl = jest.fn();

jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: {
    getSession: (...args: unknown[]) => mockGetSession(args[0] as string),
    sendMessageSmart: (...args: unknown[]) => mockSendMessageSmart(args[0]),
    postMessage: (...args: unknown[]) => mockPostMessage(args[0]),
    postAudioMessage: (...args: unknown[]) => mockPostAudioMessage(args[0]),
    getMessageImageUrl: (...args: unknown[]) => mockGetMessageImageUrl(args[0]),
  },
}));

// Sentry
jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
}));

// Runtime settings
jest.mock('@/features/settings/application/useRuntimeSettings', () => ({
  useRuntimeSettings: () => ({
    locale: 'en-US',
    museumMode: true,
    guideLevel: 'beginner' as const,
    isLoading: false,
    settings: null,
  }),
}));

// Connectivity
let mockIsConnected = true;
jest.mock('@/shared/infrastructure/connectivity/useConnectivity', () => ({
  useConnectivity: () => ({ isConnected: mockIsConnected }),
}));

// Offline queue
const mockEnqueue = jest
  .fn<
    {
      id: string;
      sessionId: string;
      text?: string;
      imageUri?: string;
      createdAt: number;
      retryCount: number;
    },
    [{ sessionId: string; text?: string; imageUri?: string }]
  >()
  .mockImplementation((msg) => ({
    id: 'queued-1',
    sessionId: msg.sessionId,
    text: msg.text,
    imageUri: msg.imageUri,
    createdAt: Date.now(),
    retryCount: 0,
  }));
const mockDequeue = jest.fn();
const mockPeek = jest
  .fn<
    | {
        id: string;
        sessionId: string;
        text?: string;
        imageUri?: string;
        createdAt: number;
        retryCount: number;
      }
    | undefined,
    []
  >()
  .mockReturnValue(undefined);
let mockIsOffline = false;
let mockPendingCount = 0;

jest.mock('@/features/chat/application/useOfflineQueue', () => ({
  useOfflineQueue: () => ({
    isOffline: mockIsOffline,
    enqueue: mockEnqueue,
    dequeue: mockDequeue,
    peek: mockPeek,
    pendingCount: mockPendingCount,
  }),
}));

// Zustand session store
const mockSetSession = jest.fn();
const mockUpdateMessages = jest.fn();

jest.mock('@/features/chat/infrastructure/chatSessionStore', () => ({
  useChatSessionStore: (
    selector: (state: {
      sessions: Record<string, unknown>;
      setSession: jest.Mock;
      updateMessages: jest.Mock;
    }) => unknown,
  ) =>
    selector({
      sessions: {},
      setSession: mockSetSession,
      updateMessages: mockUpdateMessages,
    }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const SESSION_ID = 'test-session-123';

const makeApiMessages = (msgs: { id: string; role: string; text: string }[]) =>
  msgs.map((m) => ({
    id: m.id,
    role: m.role,
    text: m.text,
    createdAt: new Date().toISOString(),
    imageRef: null,
    image: null,
    metadata: null,
  }));

const defaultSessionResponse = () => ({
  session: { title: 'Test Session', museumName: 'Louvre' },
  messages: makeApiMessages([
    { id: 'msg-1', role: 'user', text: 'Hello' },
    { id: 'msg-2', role: 'assistant', text: 'Welcome!' },
  ]),
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useChatSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsConnected = true;
    mockIsOffline = false;
    mockPendingCount = 0;
    mockGetSession.mockResolvedValue(defaultSessionResponse());
    mockPeek.mockReturnValue(undefined);
  });

  it('initialises with isLoading=true, loads session via API, and updates messages', async () => {
    const { result } = renderHook(() => useChatSession(SESSION_ID));

    // Immediately after mount, loading should be true
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetSession).toHaveBeenCalledWith(SESSION_ID);
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].text).toBe('Hello');
    expect(result.current.messages[1].text).toBe('Welcome!');
    expect(result.current.sessionTitle).toBe('Test Session');
    expect(result.current.museumName).toBe('Louvre');
  });

  it('sendMessage() with text adds an optimistic message and calls chatApi.sendMessageSmart', async () => {
    mockSendMessageSmart.mockResolvedValue({
      message: {
        id: 'resp-1',
        role: 'assistant',
        text: 'AI response',
        createdAt: new Date().toISOString(),
      },
      metadata: null,
    });

    const { result } = renderHook(() => useChatSession(SESSION_ID));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let sendResult: boolean | undefined;
    await act(async () => {
      sendResult = await result.current.sendMessage({ text: 'Hi there' });
    });

    expect(sendResult).toBe(true);
    expect(mockSendMessageSmart).toHaveBeenCalledTimes(1);

    // The call should contain the session ID and text
    const callArgs = mockSendMessageSmart.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.sessionId).toBe(SESSION_ID);
    expect(callArgs.text).toBe('Hi there');
    expect(callArgs.locale).toBe('en-US');
    expect(callArgs.museumMode).toBe(true);
    expect(callArgs.guideLevel).toBe('beginner');
  });

  it('sendMessage() in offline mode enqueues in the offline queue', async () => {
    mockIsOffline = true;

    const { result } = renderHook(() => useChatSession(SESSION_ID));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let sendResult: boolean | undefined;
    await act(async () => {
      sendResult = await result.current.sendMessage({ text: 'Offline msg' });
    });

    expect(sendResult).toBe(true);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        text: 'Offline msg',
      }),
    );
    // Should NOT call the API
    expect(mockSendMessageSmart).not.toHaveBeenCalled();

    // The message should appear in the list as an optimistic entry
    const offlineMsg = result.current.messages.find((m: ChatUiMessage) => m.id === 'queued-1');
    expect(offlineMsg).toBeDefined();
    expect(offlineMsg?.role).toBe('user');
  });

  it('clearError() resets the error state', async () => {
    mockGetSession.mockRejectedValue(new Error('Network failure'));

    const { result } = renderHook(() => useChatSession(SESSION_ID));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Network failure');

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });

  it('refreshMessageImageUrl() calls chatApi.getMessageImageUrl and updates the message', async () => {
    const signedUrlResponse = {
      url: 'https://signed.url/image.jpg',
      expiresAt: '2099-01-01T00:00:00Z',
    };
    mockGetMessageImageUrl.mockResolvedValue(signedUrlResponse);

    const { result } = renderHook(() => useChatSession(SESSION_ID));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let signedResult: unknown;
    await act(async () => {
      signedResult = await result.current.refreshMessageImageUrl('msg-1');
    });

    expect(mockGetMessageImageUrl).toHaveBeenCalledWith('msg-1');
    expect(signedResult).toEqual(signedUrlResponse);

    // The message should now have the signed image
    const updatedMsg = result.current.messages.find((m: ChatUiMessage) => m.id === 'msg-1');
    expect(updatedMsg?.image).toEqual(signedUrlResponse);
  });

  it('syncs API data to the Zustand store after loading', async () => {
    const { result } = renderHook(() => useChatSession(SESSION_ID));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockSetSession).toHaveBeenCalledWith(
      SESSION_ID,
      expect.arrayContaining([
        expect.objectContaining({ id: 'msg-1' }),
        expect.objectContaining({ id: 'msg-2' }),
      ]),
      'Test Session',
      'Louvre',
    );
  });

  it('sendMessage() returns false for empty input', async () => {
    const { result } = renderHook(() => useChatSession(SESSION_ID));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let sendResult: boolean | undefined;
    await act(async () => {
      sendResult = await result.current.sendMessage({ text: '   ' });
    });

    expect(sendResult).toBe(false);
    expect(mockSendMessageSmart).not.toHaveBeenCalled();
  });

  it('sets error when sendMessage() API call fails', async () => {
    mockSendMessageSmart.mockRejectedValue(new Error('Server error'));

    const { result } = renderHook(() => useChatSession(SESSION_ID));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage({ text: 'will fail' });
    });

    expect(result.current.error).toBe('Server error');
    expect(result.current.isSending).toBe(false);
  });

  it('exposes runtime settings from useRuntimeSettings', async () => {
    const { result } = renderHook(() => useChatSession(SESSION_ID));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.locale).toBe('en-US');
    expect(result.current.museumMode).toBe(true);
  });
});
