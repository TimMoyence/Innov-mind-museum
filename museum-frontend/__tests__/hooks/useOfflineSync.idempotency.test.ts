/**
 * RUN_ID 2026-06-01-weak-net-idempotency — phase RED (UFR-022).
 *
 * W1-IDEM-05 (FE / hook) — on reconnect flush, `useOfflineSync` MUST forward
 * the queued item's stable `id` as `idempotencyKey` so the backend dedup layer
 * can collapse a double-flush into a single message (spec R4):
 *   - each `chatApi.postMessage` call carries `idempotencyKey === queued.id`;
 *   - exactly ONE post per queued item, even if the effect re-fires (flapping
 *     reconnect) — the backend key makes the duplicate a no-op, and the hook
 *     dequeues each item once.
 *
 * RED expectation: `peek()` currently OMITS `id` from its return type
 * (`useOfflineSync.ts:21` = `{ sessionId, text?, imageUri? }`), and the flush
 * loop never threads an `idempotencyKey` into `chatApi.postMessage`. So
 * `postMessage` is called WITHOUT `idempotencyKey` → assertions fail → exits ≠ 0.
 *
 * Run scope (FE): npx jest idempotency
 */
import { renderHook, waitFor } from '@testing-library/react-native';

import { useOfflineSync } from '@/features/chat/application/useOfflineSync';
import type { ChatUiMessage } from '@/features/chat/application/chatSessionLogic.pure';
import { makeQueuedMessage, makeGetSessionResponse } from '@/__tests__/helpers/factories';

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

const SESSION_ID = 'offline-session-idem';

/** Bypasses backoff delays so tests run synchronously. */
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

// ── Tests ────────────────────────────────────────────────────────────────────

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

    // First render flushes the item; a connectivity blip re-renders the hook.
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

    // Re-fire the effect (flapping). The item was already dequeued, so peek()
    // now returns undefined → no second post for the same item.
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
