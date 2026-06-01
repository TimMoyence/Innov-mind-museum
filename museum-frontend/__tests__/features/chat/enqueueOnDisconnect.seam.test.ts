/**
 * RED (W1-L1-09) — M2 enqueue-on-disconnect seam.
 *
 * Drives the REAL `pickSendStrategy` → 'offline' when the context is offline, then
 * the REAL `sendMessageOffline`, asserting it:
 *  - calls `context.enqueue` exactly ONCE, and
 *  - appends exactly ONE optimistic message via `setMessages` (spec R3),
 *  - returns `false` and appends NO optimistic message when the queue is full
 *    (`enqueue` resolves `null`).
 *
 * Fails RED because the `makeQueuedMessage` factory (DRY, `__tests__/helpers/factories`)
 * does not exist yet.
 */
import { pickSendStrategy } from '@/features/chat/application/chatSessionStrategies.pure';
import { sendMessageOffline } from '@/features/chat/application/sendStrategies/sendMessageOffline';
import type { SendMessageContext } from '@/features/chat/application/sendStrategies/sendStrategy.types';
import type { ChatUiMessage } from '@/features/chat/application/chatSessionLogic.pure';
import { makeQueuedMessage } from '@/__tests__/helpers/factories';
import { nonNull } from '@/__tests__/helpers/nonNull';

const makeOfflineContext = (
  enqueue: SendMessageContext['enqueue'],
  setMessages: jest.Mock,
): SendMessageContext =>
  ({
    sessionId: 'sess-offline',
    imageFallbackLabel: 'Image sent',
    audioFallbackLabel: 'Voice message',
    enqueue,
    setMessages,
  }) as unknown as SendMessageContext;

describe('M2 — enqueue-on-disconnect seam', () => {
  it('pickSendStrategy returns "offline" when the context is offline', () => {
    const kind = pickSendStrategy(
      { text: 'hello' },
      {
        isLowData: false,
        isOffline: true,
        isConnected: false,
        museumName: null,
        isFirstTurn: false,
      },
    );

    expect(kind).toBe('offline');
  });

  it('enqueues exactly once and appends one optimistic message', async () => {
    const queued = makeQueuedMessage({ sessionId: 'sess-offline', text: 'hello' });
    const enqueue = jest.fn().mockResolvedValue(queued);
    const setMessages = jest.fn();

    const result = await sendMessageOffline(
      { text: 'hello' },
      makeOfflineContext(enqueue, setMessages),
    );

    expect(result).toBe(true);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'sess-offline', text: 'hello' }),
    );

    expect(setMessages).toHaveBeenCalledTimes(1);
    const updater = setMessages.mock.calls[0][0] as (prev: ChatUiMessage[]) => ChatUiMessage[];
    const next = updater([]);
    expect(next).toHaveLength(1);
    expect(nonNull(next[0]).role).toBe('user');
    expect(nonNull(next[0]).id).toBe(queued.id);
  });

  it('returns false and appends no optimistic message when the queue is full', async () => {
    const enqueue = jest.fn().mockResolvedValue(null);
    const setMessages = jest.fn();

    const result = await sendMessageOffline(
      { text: 'dropped' },
      makeOfflineContext(enqueue, setMessages),
    );

    expect(result).toBe(false);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(setMessages).not.toHaveBeenCalled();
  });
});
