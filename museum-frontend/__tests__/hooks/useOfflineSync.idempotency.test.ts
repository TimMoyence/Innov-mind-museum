import { renderHook, waitFor } from '@testing-library/react-native';

import { useOfflineSync } from '@/features/chat/application/useOfflineSync';
import type { ChatUiMessage } from '@/features/chat/application/chatSessionLogic.pure';
import { makeQueuedMessage, makeGetSessionResponse } from '@/__tests__/helpers/factories';

const mockPostMessage = jest.fn<Promise<unknown>, [unknown]>();
const mockGetSession = jest.fn();

jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: {
    postMessage: (...args: unknown[]) => mockPostMessage(args[0]),
    getSession: (...args: unknown[]) => mockGetSession(args[0]),
  },
}));

const SESSION_ID = 'offline-session-idem';

const passthroughRetry = <T>(op: () => Promise<T>): Promise<T> => op();

const makeParams = (queue: ReturnType<typeof makeQueuedMessage>[]) => {
  let index = 0;
  const peek = jest.fn(() => (index < queue.length ? queue[index] : undefined));
  const dequeue = jest.fn(() => {
    index += 1;
  });
  const setMessages = jest.fn<undefined, [React.SetStateAction<ChatUiMessage[]>]>();

  return {
    sessionId: SESSION_ID,
    isConnected: true,
    museumMode: true,
    guideLevel: 'beginner' as const,
    locale: 'en-US',
    peek,
    dequeue,
    setMessages,
    retry: passthroughRetry,
  };
};

describe('useOfflineSync — idempotency forwarding (W1-IDEM-05)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPostMessage.mockResolvedValue({});
    mockGetSession.mockResolvedValue(makeGetSessionResponse());
  });

  it('forwards the queued item id as idempotencyKey on flush', async () => {
    const queued = makeQueuedMessage({ sessionId: SESSION_ID, text: 'queued offline' });
    const params = makeParams([queued]);

    renderHook(() => {
      useOfflineSync(params);
    });

    await waitFor(() => {
      expect(mockPostMessage).toHaveBeenCalledTimes(1);
    });

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        text: 'queued offline',
        idempotencyKey: queued.id,
      }),
    );
  });

  it('uses the per-item id (not the session id) so each queued message gets its own key', async () => {
    const first = makeQueuedMessage({ sessionId: SESSION_ID, text: 'first' });
    const second = makeQueuedMessage({ sessionId: SESSION_ID, text: 'second' });
    const params = makeParams([first, second]);

    renderHook(() => {
      useOfflineSync(params);
    });

    await waitFor(() => {
      expect(mockPostMessage).toHaveBeenCalledTimes(2);
    });

    const keys = mockPostMessage.mock.calls.map(
      (call) => (call[0] as { idempotencyKey?: string }).idempotencyKey,
    );
    expect(keys).toEqual([first.id, second.id]);
  });

  it('posts each item exactly once with a stable idempotencyKey across a flapping re-fire', async () => {
    const queued = makeQueuedMessage({ sessionId: SESSION_ID, text: 'do not duplicate' });
    const params = makeParams([queued]);

    const { rerender } = renderHook(
      ({ p }: { p: ReturnType<typeof makeParams> }) => {
        useOfflineSync(p);
      },
      {
        initialProps: { p: params },
      },
    );

    await waitFor(() => {
      expect(mockPostMessage).toHaveBeenCalledTimes(1);
    });

    rerender({ p: params });

    await waitFor(() => {
      expect(params.dequeue).toHaveBeenCalledTimes(1);
    });

    expect(mockPostMessage).toHaveBeenCalledTimes(1);
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: queued.id }),
    );
  });
});
