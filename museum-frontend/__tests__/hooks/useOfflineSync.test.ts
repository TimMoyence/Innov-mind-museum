import { renderHook, waitFor } from '@testing-library/react-native';

import { useOfflineSync } from '@/features/chat/application/useOfflineSync';
import type { ChatUiMessage } from '@/features/chat/application/chatSessionLogic.pure';
import { makeChatUiMessage, makeGetSessionResponse } from '@/__tests__/helpers/factories';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPostMessage = jest.fn<Promise<unknown>, [unknown]>();
const mockGetSession = jest.fn();

jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: {
    postMessage: (...args: unknown[]) => mockPostMessage(args[0]),
    getSession: (...args: unknown[]) => mockGetSession(args[0]),
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const SESSION_ID = 'offline-session-1';

interface QueueItem {
  sessionId: string;
  text?: string;
  imageUri?: string;
}

const makeDefaultParams = (overrides?: {
  isConnected?: boolean;
  peekQueue?: QueueItem[];
  setMessages?: React.Dispatch<React.SetStateAction<ChatUiMessage[]>>;
}) => {
  const queue = overrides?.peekQueue ?? [];
  let queueIndex = 0;

  const peek = jest.fn(() => (queueIndex < queue.length ? queue[queueIndex] : undefined));
  const dequeue = jest.fn(() => {
    queueIndex++;
  });
  const setMessages =
    overrides?.setMessages ?? jest.fn<undefined, [React.SetStateAction<ChatUiMessage[]>]>();

  return {
    sessionId: SESSION_ID,
    isConnected: overrides?.isConnected ?? true,
    museumMode: true,
    guideLevel: 'beginner' as const,
    locale: 'en-US',
    peek,
    dequeue,
    setMessages,
  };
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useOfflineSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPostMessage.mockResolvedValue({});
  });

  it('does nothing when offline', () => {
    const params = makeDefaultParams({
      isConnected: false,
      peekQueue: [{ sessionId: SESSION_ID, text: 'queued' }],
    });

    renderHook(() => {
      useOfflineSync(params);
    });

    expect(mockPostMessage).not.toHaveBeenCalled();
    expect(params.dequeue).not.toHaveBeenCalled();
  });

  it('processes a single queued message when online', async () => {
    const sessionResponse = makeGetSessionResponse();
    mockGetSession.mockResolvedValue(sessionResponse);

    const params = makeDefaultParams({
      isConnected: true,
      peekQueue: [{ sessionId: SESSION_ID, text: 'offline msg' }],
    });

    renderHook(() => {
      useOfflineSync(params);
    });

    await waitFor(() => {
      expect(mockPostMessage).toHaveBeenCalledTimes(1);
    });

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        text: 'offline msg',
        museumMode: true,
        guideLevel: 'beginner',
        locale: 'en-US',
      }),
    );
    expect(params.dequeue).toHaveBeenCalledTimes(1);
  });

  it('processes multiple queued messages sequentially', async () => {
    const sessionResponse = makeGetSessionResponse();
    mockGetSession.mockResolvedValue(sessionResponse);

    const params = makeDefaultParams({
      isConnected: true,
      peekQueue: [
        { sessionId: SESSION_ID, text: 'first' },
        { sessionId: SESSION_ID, text: 'second' },
      ],
    });

    renderHook(() => {
      useOfflineSync(params);
    });

    await waitFor(() => {
      expect(mockPostMessage).toHaveBeenCalledTimes(2);
    });

    expect(params.dequeue).toHaveBeenCalledTimes(2);
  });

  it('re-fetches session after flushing to merge assistant replies', async () => {
    const msg = makeChatUiMessage({ id: 'synced-1', role: 'assistant', text: 'AI reply' });
    const sessionResponse = makeGetSessionResponse({
      messages: [
        {
          id: msg.id,
          role: 'assistant',
          text: msg.text,
          createdAt: msg.createdAt,
          imageRef: null,
          image: null,
          metadata: null,
        },
      ],
    });
    mockGetSession.mockResolvedValue(sessionResponse);

    const params = makeDefaultParams({
      isConnected: true,
      peekQueue: [{ sessionId: SESSION_ID, text: 'trigger flush' }],
    });

    renderHook(() => {
      useOfflineSync(params);
    });

    await waitFor(() => {
      expect(mockGetSession).toHaveBeenCalledWith(SESSION_ID);
    });

    expect(params.setMessages).toHaveBeenCalled();
  });

  it('stops processing on postMessage failure', async () => {
    mockPostMessage.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Network error'));

    const sessionResponse = makeGetSessionResponse();
    mockGetSession.mockResolvedValue(sessionResponse);

    const params = makeDefaultParams({
      isConnected: true,
      peekQueue: [
        { sessionId: SESSION_ID, text: 'first' },
        { sessionId: SESSION_ID, text: 'second - will fail' },
        { sessionId: SESSION_ID, text: 'third - should not run' },
      ],
    });

    renderHook(() => {
      useOfflineSync(params);
    });

    await waitFor(() => {
      expect(mockPostMessage).toHaveBeenCalledTimes(2);
    });

    // Only the first message was dequeued
    expect(params.dequeue).toHaveBeenCalledTimes(1);
    // Still re-fetches because flushedAny was true (first message succeeded)
    expect(mockGetSession).toHaveBeenCalledTimes(1);
  });

  it('does not re-fetch session if no messages were flushed', async () => {
    mockPostMessage.mockRejectedValue(new Error('Immediate fail'));

    const params = makeDefaultParams({
      isConnected: true,
      peekQueue: [{ sessionId: SESSION_ID, text: 'will fail' }],
    });

    renderHook(() => {
      useOfflineSync(params);
    });

    await waitFor(() => {
      expect(mockPostMessage).toHaveBeenCalledTimes(1);
    });

    expect(params.dequeue).not.toHaveBeenCalled();
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it('does nothing when queue is empty and online', () => {
    const params = makeDefaultParams({
      isConnected: true,
      peekQueue: [],
    });

    renderHook(() => {
      useOfflineSync(params);
    });

    expect(mockPostMessage).not.toHaveBeenCalled();
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it('handles getSession failure gracefully after flushing', async () => {
    mockGetSession.mockRejectedValue(new Error('Session fetch failed'));

    const params = makeDefaultParams({
      isConnected: true,
      peekQueue: [{ sessionId: SESSION_ID, text: 'queued' }],
    });

    renderHook(() => {
      useOfflineSync(params);
    });

    await waitFor(() => {
      expect(mockPostMessage).toHaveBeenCalledTimes(1);
    });

    // Should dequeue and attempt getSession but not throw
    expect(params.dequeue).toHaveBeenCalledTimes(1);
    expect(mockGetSession).toHaveBeenCalledTimes(1);
    // setMessages should NOT be called since getSession failed
    expect(params.setMessages).not.toHaveBeenCalled();
  });

  it('includes imageUri in postMessage when present in queue item', async () => {
    const sessionResponse = makeGetSessionResponse();
    mockGetSession.mockResolvedValue(sessionResponse);

    const params = makeDefaultParams({
      isConnected: true,
      peekQueue: [{ sessionId: SESSION_ID, text: 'with image', imageUri: 'file:///photo.jpg' }],
    });

    renderHook(() => {
      useOfflineSync(params);
    });

    await waitFor(() => {
      expect(mockPostMessage).toHaveBeenCalledTimes(1);
    });

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUri: 'file:///photo.jpg',
      }),
    );
  });

  // ── First item fails: loop breaks, no further processing ────────────────

  it('breaks immediately when the first queue item fails', async () => {
    mockPostMessage.mockRejectedValue(new Error('Server down'));

    const params = makeDefaultParams({
      isConnected: true,
      peekQueue: [
        { sessionId: SESSION_ID, text: 'first fails' },
        { sessionId: SESSION_ID, text: 'should not run' },
      ],
    });

    renderHook(() => {
      useOfflineSync(params);
    });

    await waitFor(() => {
      expect(mockPostMessage).toHaveBeenCalledTimes(1);
    });

    // No messages dequeued since the first one failed
    expect(params.dequeue).not.toHaveBeenCalled();
    // No refetch since flushedAny is false
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(params.setMessages).not.toHaveBeenCalled();
  });

  // ── Partial flush: 2 of 3 succeed, 3rd fails → refetch for successful ones

  it('refetches session after partial flush (2 succeed, 3rd fails)', async () => {
    mockPostMessage
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('Third fails'));

    const sessionResponse = makeGetSessionResponse();
    mockGetSession.mockResolvedValue(sessionResponse);

    const params = makeDefaultParams({
      isConnected: true,
      peekQueue: [
        { sessionId: SESSION_ID, text: 'msg1' },
        { sessionId: SESSION_ID, text: 'msg2' },
        { sessionId: SESSION_ID, text: 'msg3 fails' },
      ],
    });

    renderHook(() => {
      useOfflineSync(params);
    });

    await waitFor(() => {
      expect(mockPostMessage).toHaveBeenCalledTimes(3);
    });

    // 2 successful dequeues
    expect(params.dequeue).toHaveBeenCalledTimes(2);
    // flushedAny is true so getSession is called
    expect(mockGetSession).toHaveBeenCalledTimes(1);
    expect(params.setMessages).toHaveBeenCalled();
  });

  // ── getSession throws after successful posts → no crash ─────────────────

  it('catches getSession error silently after successful posts', async () => {
    mockPostMessage.mockResolvedValue({});
    mockGetSession.mockRejectedValue(new Error('Session fetch exploded'));

    const params = makeDefaultParams({
      isConnected: true,
      peekQueue: [
        { sessionId: SESSION_ID, text: 'msg1' },
        { sessionId: SESSION_ID, text: 'msg2' },
      ],
    });

    renderHook(() => {
      useOfflineSync(params);
    });

    await waitFor(() => {
      expect(mockPostMessage).toHaveBeenCalledTimes(2);
    });

    expect(params.dequeue).toHaveBeenCalledTimes(2);
    expect(mockGetSession).toHaveBeenCalledTimes(1);
    // setMessages NOT called because getSession threw
    expect(params.setMessages).not.toHaveBeenCalled();
  });

  // ── Empty queue: peek returns undefined → skips refetch entirely ────────

  it('skips refetch when queue is empty (peek returns undefined)', () => {
    const params = makeDefaultParams({
      isConnected: true,
      peekQueue: [],
    });

    renderHook(() => {
      useOfflineSync(params);
    });

    // peek is called once and returns undefined
    expect(params.peek).toHaveBeenCalled();
    expect(mockPostMessage).not.toHaveBeenCalled();
    expect(params.dequeue).not.toHaveBeenCalled();
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(params.setMessages).not.toHaveBeenCalled();
  });
});
