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

// DataMode
let mockIsLowData = false;
jest.mock('@/features/chat/application/DataModeProvider', () => ({
  useDataMode: () => ({ isLowData: mockIsLowData }),
}));

// chatLocalCache
const mockCacheLookup = jest.fn().mockReturnValue(null);
const mockCacheStore = jest.fn();
jest.mock('@/features/chat/application/chatLocalCache', () => ({
  useChatLocalCacheStore: (selector: (state: { lookup: jest.Mock; store: jest.Mock }) => unknown) =>
    selector({ lookup: mockCacheLookup, store: mockCacheStore }),
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
    mockIsLowData = false;
    mockPendingCount = 0;
    mockGetSession.mockResolvedValue(defaultSessionResponse());
    mockPeek.mockReturnValue(undefined);
    mockCacheLookup.mockReturnValue(null);
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

  // ── Audio message flow ────────────────────────────────────────────────────

  it('sendMessage() with audioUri uses postAudioMessage and adds assistant message', async () => {
    mockPostAudioMessage.mockResolvedValue({
      message: {
        id: 'audio-resp-1',
        role: 'assistant',
        text: 'I heard your question about the painting.',
        createdAt: new Date().toISOString(),
      },
      metadata: { detectedArtwork: { title: 'Mona Lisa' } },
    });

    const { result } = renderHook(() => useChatSession(SESSION_ID));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let sendResult: boolean | undefined;
    await act(async () => {
      sendResult = await result.current.sendMessage({ audioUri: 'file://voice.m4a' });
    });

    expect(sendResult).toBe(true);
    expect(mockPostAudioMessage).toHaveBeenCalledTimes(1);
    const callArgs = mockPostAudioMessage.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.sessionId).toBe(SESSION_ID);
    expect(callArgs.audioUri).toBe('file://voice.m4a');
    expect(mockSendMessageSmart).not.toHaveBeenCalled();

    // Should have assistant message in the list
    const assistantMsg = result.current.messages.find(
      (m: ChatUiMessage) => m.id === 'audio-resp-1',
    );
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg?.text).toBe('I heard your question about the painting.');
  });

  it('sendMessage() with audioBlob uses postAudioMessage', async () => {
    mockPostAudioMessage.mockResolvedValue({
      message: {
        id: 'blob-resp-1',
        role: 'assistant',
        text: 'Audio response',
        createdAt: new Date().toISOString(),
      },
      metadata: null,
    });

    const { result } = renderHook(() => useChatSession(SESSION_ID));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const blob = new Blob(['audio-data'], { type: 'audio/webm' });
    let sendResult: boolean | undefined;
    await act(async () => {
      sendResult = await result.current.sendMessage({ audioBlob: blob });
    });

    expect(sendResult).toBe(true);
    expect(mockPostAudioMessage).toHaveBeenCalledTimes(1);
    const callArgs = mockPostAudioMessage.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.audioBlob).toBe(blob);
  });

  it('sendMessage() with audio shows transcription on optimistic user message', async () => {
    mockPostAudioMessage.mockResolvedValue({
      message: {
        id: 'transcribed-resp',
        role: 'assistant',
        text: 'Response to transcript',
        createdAt: new Date().toISOString(),
      },
      metadata: null,
      transcription: { text: 'What is this painting?' },
    });

    const { result } = renderHook(() => useChatSession(SESSION_ID));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage({ audioUri: 'file://voice.m4a' });
    });

    // The optimistic user message should have been updated with transcription text
    const userMessages = result.current.messages.filter((m: ChatUiMessage) => m.role === 'user');
    const transcribedMsg = userMessages.find((m: ChatUiMessage) =>
      m.text.includes('What is this painting?'),
    );
    expect(transcribedMsg).toBeDefined();
  });

  // ── Image message with optimistic placeholder ─────────────────────────────

  it('sendMessage() with imageUri adds optimistic message with [Image sent] text', async () => {
    mockSendMessageSmart.mockResolvedValue({
      message: {
        id: 'img-resp-1',
        role: 'assistant',
        text: 'Nice painting!',
        createdAt: new Date().toISOString(),
      },
      metadata: null,
    });

    const { result } = renderHook(() => useChatSession(SESSION_ID));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage({ imageUri: 'file://photo.jpg' });
    });

    expect(mockSendMessageSmart).toHaveBeenCalledTimes(1);
    const callArgs = mockSendMessageSmart.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.imageUri).toBe('file://photo.jpg');
  });

  // ── Send failure recovery ─────────────────────────────────────────────────

  it('marks optimistic message as sendFailed when API call throws', async () => {
    mockSendMessageSmart.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useChatSession(SESSION_ID));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage({ text: 'will fail' });
    });

    const failedMsg = result.current.messages.find((m: ChatUiMessage) => m.sendFailed === true);
    expect(failedMsg).toBeDefined();
    expect(failedMsg?.role).toBe('user');
  });

  it('removes streaming placeholder on send failure', async () => {
    mockSendMessageSmart.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useChatSession(SESSION_ID));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage({ text: 'will fail' });
    });

    // No message should end with '-streaming'
    const streamingMsgs = result.current.messages.filter((m: ChatUiMessage) =>
      m.id.endsWith('-streaming'),
    );
    expect(streamingMsgs).toHaveLength(0);
  });

  // ── Retry failed message ──────────────────────────────────────────────────

  it('retryMessage() removes the failed message and re-sends', async () => {
    // First send fails
    mockSendMessageSmart.mockRejectedValueOnce(new Error('Temp error'));

    const { result } = renderHook(() => useChatSession(SESSION_ID));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage({ text: 'retry me' });
    });

    const failedMsg = result.current.messages.find((m: ChatUiMessage) => m.sendFailed === true);
    expect(failedMsg).toBeDefined();

    // Now retry - second call succeeds
    mockSendMessageSmart.mockResolvedValueOnce({
      message: {
        id: 'retry-resp',
        role: 'assistant',
        text: 'Success after retry',
        createdAt: new Date().toISOString(),
      },
      metadata: null,
    });

    act(() => {
      if (!failedMsg) throw new Error('Expected failedMsg to be defined');
      result.current.retryMessage(failedMsg);
    });

    // retryMessage fires sendMessage asynchronously via void - wait for it
    await waitFor(() => {
      expect(mockSendMessageSmart).toHaveBeenCalledTimes(2);
    });

    // The second call should contain the text from the failed message
    const retryArgs = mockSendMessageSmart.mock.calls[1][0] as Record<string, unknown>;
    expect(retryArgs.text).toBe('retry me');
  });

  // ── Offline mode with image ───────────────────────────────────────────────

  it('sendMessage() in offline mode with imageUri queues correctly', async () => {
    mockIsOffline = true;

    const { result } = renderHook(() => useChatSession(SESSION_ID));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage({ imageUri: 'file://offline-photo.jpg' });
    });

    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        imageUri: 'file://offline-photo.jpg',
      }),
    );

    const offlineMsg = result.current.messages.find((m: ChatUiMessage) => m.id === 'queued-1');
    expect(offlineMsg).toBeDefined();
    expect(offlineMsg?.text).toBe('[Image sent]');
    expect(offlineMsg?.image).toEqual({ url: 'file://offline-photo.jpg', expiresAt: '' });
  });

  it('sendMessage() in offline mode returns false when enqueue fails', async () => {
    mockIsOffline = true;
    mockEnqueue.mockReturnValueOnce(null as unknown as ReturnType<typeof mockEnqueue>);

    const { result } = renderHook(() => useChatSession(SESSION_ID));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let sendResult: boolean | undefined;
    await act(async () => {
      sendResult = await result.current.sendMessage({ text: 'queue full' });
    });

    expect(sendResult).toBe(false);
  });

  // ── Voice message text for optimistic message ─────────────────────────────

  it('sendMessage() with audioUri but no text shows [Voice message] optimistic text', async () => {
    mockPostAudioMessage.mockResolvedValue({
      message: {
        id: 'voice-resp',
        role: 'assistant',
        text: 'Audio response',
        createdAt: new Date().toISOString(),
      },
      metadata: null,
    });

    const { result } = renderHook(() => useChatSession(SESSION_ID));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage({ audioUri: 'file://voice.m4a' });
    });

    // Should have an optimistic user message with [Voice message]
    const voiceMsg = result.current.messages.find(
      (m: ChatUiMessage) => m.role === 'user' && m.text === '[Voice message]',
    );
    expect(voiceMsg).toBeDefined();
  });

  // ── Review prompt at 3rd successful send ──────────────────────────────────

  it('calls incrementCompletedSessions on 3rd successful send', async () => {
    const { incrementCompletedSessions } = require('@/shared/infrastructure/inAppReview');

    mockSendMessageSmart.mockResolvedValue({
      message: {
        id: 'resp',
        role: 'assistant',
        text: 'Response',
        createdAt: new Date().toISOString(),
      },
      metadata: null,
    });

    const { result } = renderHook(() => useChatSession(SESSION_ID));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Send 3 messages
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await result.current.sendMessage({ text: `msg ${String(i)}` });
      });
    }

    expect(incrementCompletedSessions).toHaveBeenCalledTimes(1);
  });

  // ── isEmpty ───────────────────────────────────────────────────────────────

  it('isEmpty is true when no messages loaded', async () => {
    mockGetSession.mockResolvedValue({
      session: { title: null, museumName: null },
      messages: [],
    });

    const { result } = renderHook(() => useChatSession(SESSION_ID));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isEmpty).toBe(true);
  });

  // ── Non-streaming fallback for image messages ─────────────────────────────

  it('sendMessage() with imageUri keeps optimistic local file:// preview and does not reload the session', async () => {
    // sendMessageSmart returns a response with message.text for image path
    mockSendMessageSmart.mockImplementation(() => {
      return Promise.resolve({
        sessionId: SESSION_ID,
        message: {
          id: 'img-server-resp',
          role: 'assistant',
          text: 'This is a beautiful painting',
          createdAt: new Date().toISOString(),
        },
        metadata: { detectedArtwork: { title: 'Water Lilies' } },
      });
    });

    mockGetSession.mockResolvedValue(defaultSessionResponse());

    const { result } = renderHook(() => useChatSession(SESSION_ID));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const initialGetSessionCalls = mockGetSession.mock.calls.length;

    await act(async () => {
      await result.current.sendMessage({
        text: 'What painting is this?',
        imageUri: 'file://painting.jpg',
      });
    });

    expect(mockSendMessageSmart).toHaveBeenCalledTimes(1);

    // No extra getSession call — the optimistic local preview is preserved.
    expect(mockGetSession).toHaveBeenCalledTimes(initialGetSessionCalls);

    // The optimistic user message is kept with its local file:// URI.
    const userMsg = result.current.messages.find(
      (m) => m.role === 'user' && m.text === 'What painting is this?',
    );
    expect(userMsg?.image?.url).toBe('file://painting.jpg');

    // The assistant reply replaced the streaming placeholder.
    const assistantMsg = result.current.messages.find((m) => m.id === 'img-server-resp');
    expect(assistantMsg?.text).toBe('This is a beautiful painting');
  });

  // ── Streaming onDone callback ──────────────────────────────────────────────

  it('sendMessage() with streaming invokes onToken and onDone to build assistant message', async () => {
    mockSendMessageSmart.mockImplementation(
      (params: {
        onToken?: (text: string) => void;
        onDone?: (payload: {
          messageId: string;
          createdAt: string;
          metadata: Record<string, unknown>;
        }) => void;
      }) => {
        // Simulate streaming: call onToken then onDone
        params.onToken?.('Hello ');
        params.onToken?.('world!');
        params.onDone?.({
          messageId: 'streamed-msg-1',
          createdAt: new Date().toISOString(),
          metadata: { detectedArtwork: { title: 'Mona Lisa' } },
        });
        return Promise.resolve(null);
      },
    );

    const { result } = renderHook(() => useChatSession(SESSION_ID));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage({ text: 'Tell me about this' });
    });

    // The onDone callback should have replaced the streaming placeholder
    const streamedMsg = result.current.messages.find(
      (m: ChatUiMessage) => m.id === 'streamed-msg-1',
    );
    expect(streamedMsg).toBeDefined();
    expect(streamedMsg?.role).toBe('assistant');
    expect(streamedMsg?.text).toBe('Hello world!');
  });

  // ── Streaming onGuardrail callback ────────────────────────────────────────

  it('sendMessage() with streaming invokes onGuardrail to set guardrail text', async () => {
    mockSendMessageSmart.mockImplementation(
      (params: {
        onGuardrail?: (text: string, reason: string) => void;
        onDone?: (payload: {
          messageId: string;
          createdAt: string;
          metadata: Record<string, unknown>;
        }) => void;
      }) => {
        // Simulate guardrail being triggered
        params.onGuardrail?.('This topic is off-limits.', 'not_art');
        params.onDone?.({
          messageId: 'guardrail-msg',
          createdAt: new Date().toISOString(),
          metadata: {},
        });
        return Promise.resolve(null);
      },
    );

    const { result } = renderHook(() => useChatSession(SESSION_ID));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage({ text: 'Off topic question' });
    });

    // The guardrail text should have been flushed into the streaming message
    const guardrailMsg = result.current.messages.find(
      (m: ChatUiMessage) => m.id === 'guardrail-msg',
    );
    expect(guardrailMsg).toBeDefined();
    expect(guardrailMsg?.text).toBe('This topic is off-limits.');
  });

  // ── Audio 3rd send triggers review prompt ─────────────────────────────────

  it('calls incrementCompletedSessions on 3rd successful audio send', async () => {
    const { incrementCompletedSessions } = require('@/shared/infrastructure/inAppReview');
    incrementCompletedSessions.mockClear();

    mockPostAudioMessage.mockResolvedValue({
      message: {
        id: 'audio-resp',
        role: 'assistant',
        text: 'Audio response',
        createdAt: new Date().toISOString(),
      },
      metadata: null,
    });

    const { result } = renderHook(() => useChatSession(SESSION_ID));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Send 3 audio messages
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await result.current.sendMessage({ audioUri: `file://voice${String(i)}.m4a` });
      });
    }

    expect(incrementCompletedSessions).toHaveBeenCalledTimes(1);
  });

  // ── Audio message failure ─────────────────────────────────────────────────

  it('sendMessage() with audio marks message as failed on error', async () => {
    mockPostAudioMessage.mockRejectedValue(new Error('Audio upload failed'));

    const { result } = renderHook(() => useChatSession(SESSION_ID));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const sendResult = await act(async () => {
      return result.current.sendMessage({ audioUri: 'file://voice.m4a' });
    });

    expect(sendResult).toBe(false);
    expect(result.current.error).toBeTruthy();
  });

  // ── Audio error: sets error state and resets streaming ───────────────────

  it('postAudioMessage error sets error string and resets isSending/isStreaming', async () => {
    mockPostAudioMessage.mockRejectedValue(new Error('Audio codec unsupported'));

    const { result } = renderHook(() => useChatSession(SESSION_ID));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const sendResult = await act(async () => {
      return result.current.sendMessage({ audioUri: 'file://bad.m4a' });
    });

    expect(sendResult).toBe(false);
    expect(result.current.error).toBe('Audio codec unsupported');
    expect(result.current.isSending).toBe(false);
    expect(result.current.isStreaming).toBe(false);
    // streaming placeholder should not remain
    const streamingMsgs = result.current.messages.filter((m: ChatUiMessage) =>
      m.id.endsWith('-streaming'),
    );
    expect(streamingMsgs).toHaveLength(0);
  });

  // ── Streaming with empty response.message.text in onDone ────────────────

  it('onDone with empty final text still replaces streaming placeholder', async () => {
    mockSendMessageSmart.mockImplementation(
      (params: {
        onToken?: (text: string) => void;
        onDone?: (payload: {
          messageId: string;
          createdAt: string;
          metadata: Record<string, unknown>;
        }) => void;
      }) => {
        // No tokens sent, so streamTextRef stays empty
        params.onDone?.({
          messageId: 'empty-text-msg',
          createdAt: new Date().toISOString(),
          metadata: {},
        });
        return Promise.resolve(null);
      },
    );

    const { result } = renderHook(() => useChatSession(SESSION_ID));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage({ text: 'Hi' });
    });

    const doneMsg = result.current.messages.find((m: ChatUiMessage) => m.id === 'empty-text-msg');
    expect(doneMsg).toBeDefined();
    expect(doneMsg?.text).toBe('');
  });

  // ── getErrorMessage with non-Error object ───────────────────────────────

  it('sets a string error when catch receives a non-Error thrown value', async () => {
    mockSendMessageSmart.mockRejectedValue('plain string error');

    const { result } = renderHook(() => useChatSession(SESSION_ID));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage({ text: 'trigger non-error' });
    });

    // getErrorMessage returns the generic fallback for non-Error values
    expect(result.current.error).toBeTruthy();
    expect(typeof result.current.error).toBe('string');
  });

  // ── Image send no longer auto-reloads — no loadSession failure to surface ───

  it('sending with an image does not trigger an extra getSession reload (no reload-error surface)', async () => {
    mockSendMessageSmart.mockResolvedValue({
      sessionId: SESSION_ID,
      message: {
        id: 'img-resp-2',
        role: 'assistant',
        text: 'Nice art',
        createdAt: new Date().toISOString(),
      },
      metadata: null,
    });

    mockGetSession.mockResolvedValue(defaultSessionResponse());

    const { result } = renderHook(() => useChatSession(SESSION_ID));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const initialGetSessionCalls = mockGetSession.mock.calls.length;

    await act(async () => {
      await result.current.sendMessage({
        text: 'Identify this',
        imageUri: 'file://art.jpg',
      });
    });

    expect(mockGetSession).toHaveBeenCalledTimes(initialGetSessionCalls);
    expect(result.current.error).toBeNull();
  });

  // ── 3rd send increment: failure does NOT increment ──────────────────────

  it('failed send on 3rd attempt does not trigger incrementCompletedSessions', async () => {
    const { incrementCompletedSessions } = require('@/shared/infrastructure/inAppReview');
    incrementCompletedSessions.mockClear();

    // First two succeed
    mockSendMessageSmart
      .mockResolvedValueOnce({
        message: {
          id: 'r1',
          role: 'assistant',
          text: 'R1',
          createdAt: new Date().toISOString(),
        },
        metadata: null,
      })
      .mockResolvedValueOnce({
        message: {
          id: 'r2',
          role: 'assistant',
          text: 'R2',
          createdAt: new Date().toISOString(),
        },
        metadata: null,
      })
      // Third fails
      .mockRejectedValueOnce(new Error('3rd fail'));

    const { result } = renderHook(() => useChatSession(SESSION_ID));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await result.current.sendMessage({ text: `msg ${String(i)}` });
      });
    }

    // successfulSendsRef only reached 2 (3rd failed), so no increment
    expect(incrementCompletedSessions).not.toHaveBeenCalled();
  });

  // ── Low-data mode cache-first ──────────────────────────────────────────────

  describe('low-data mode cache-first', () => {
    const emptySessionResponse = () => ({
      session: { title: 'Museum Chat', museumName: 'Louvre' },
      messages: [],
    });

    it('returns cached response without API call in low-data mode on cache hit', async () => {
      mockIsLowData = true;
      mockGetSession.mockResolvedValue(emptySessionResponse());
      mockCacheLookup.mockReturnValue({
        question: 'Who painted the Mona Lisa?',
        answer: 'Leonardo da Vinci',
        metadata: { detectedArtwork: { title: 'Mona Lisa' } },
        museumId: 'Louvre',
        locale: 'en-US',
        cachedAt: Date.now(),
        source: 'prefetch' as const,
      });

      const { result } = renderHook(() => useChatSession(SESSION_ID));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let sendResult: boolean | undefined;
      await act(async () => {
        sendResult = await result.current.sendMessage({ text: 'Who painted the Mona Lisa?' });
      });

      expect(sendResult).toBe(true);
      // Should NOT call the API
      expect(mockSendMessageSmart).not.toHaveBeenCalled();

      // Should have both user and cached assistant messages
      expect(result.current.messages).toHaveLength(2);
      const assistantMsg = result.current.messages.find(
        (m: ChatUiMessage) => m.role === 'assistant',
      );
      expect(assistantMsg?.text).toBe('Leonardo da Vinci');
      expect(assistantMsg?.cached).toBe(true);
    });

    it('enqueues to offline queue in low-data mode when cache miss + offline', async () => {
      mockIsLowData = true;
      mockIsConnected = false;
      mockGetSession.mockResolvedValue(emptySessionResponse());
      mockCacheLookup.mockReturnValue(null);

      const { result } = renderHook(() => useChatSession(SESSION_ID));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let sendResult: boolean | undefined;
      await act(async () => {
        sendResult = await result.current.sendMessage({ text: 'Tell me about this painting' });
      });

      expect(sendResult).toBe(true);
      expect(mockEnqueue).toHaveBeenCalledTimes(1);
      expect(mockSendMessageSmart).not.toHaveBeenCalled();
    });

    it('calls API with lowDataMode flag in low-data mode on cache miss + online', async () => {
      mockIsLowData = true;
      mockGetSession.mockResolvedValue(emptySessionResponse());
      mockCacheLookup.mockReturnValue(null);
      mockSendMessageSmart.mockResolvedValue({
        message: {
          id: 'resp-low',
          role: 'assistant',
          text: 'AI response in low mode',
          createdAt: new Date().toISOString(),
        },
        metadata: null,
      });

      const { result } = renderHook(() => useChatSession(SESSION_ID));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.sendMessage({ text: 'What is this?' });
      });

      expect(mockSendMessageSmart).toHaveBeenCalledTimes(1);
      const callArgs = mockSendMessageSmart.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs.lowDataMode).toBe(true);
    });

    it('does not lookup cache in normal mode (always API)', async () => {
      mockIsLowData = false;
      mockGetSession.mockResolvedValue(emptySessionResponse());
      mockSendMessageSmart.mockResolvedValue({
        message: {
          id: 'resp-normal',
          role: 'assistant',
          text: 'Normal response',
          createdAt: new Date().toISOString(),
        },
        metadata: null,
      });

      const { result } = renderHook(() => useChatSession(SESSION_ID));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.sendMessage({ text: 'Hello' });
      });

      // cacheLookup should not have been called
      expect(mockCacheLookup).not.toHaveBeenCalled();
      expect(mockSendMessageSmart).toHaveBeenCalledTimes(1);
      const callArgs = mockSendMessageSmart.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs.lowDataMode).toBe(false);
    });

    it('stores successful API response in chatLocalCache for first-turn museum session', async () => {
      mockIsLowData = true;
      mockGetSession.mockResolvedValue(emptySessionResponse());
      mockCacheLookup.mockReturnValue(null);
      mockSendMessageSmart.mockResolvedValue({
        message: {
          id: 'resp-store',
          role: 'assistant',
          text: 'The Mona Lisa was painted by Leonardo da Vinci.',
          createdAt: new Date().toISOString(),
        },
        metadata: { detectedArtwork: { title: 'Mona Lisa' } },
      });

      const { result } = renderHook(() => useChatSession(SESSION_ID));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.sendMessage({ text: 'Who painted the Mona Lisa?' });
      });

      expect(mockCacheStore).toHaveBeenCalledTimes(1);
      expect(mockCacheStore).toHaveBeenCalledWith(
        expect.objectContaining({
          question: 'Who painted the Mona Lisa?',
          answer: 'The Mona Lisa was painted by Leonardo da Vinci.',
          museumId: 'Louvre',
          locale: 'en-US',
          source: 'previous-call',
        }),
      );
    });
  });
});
