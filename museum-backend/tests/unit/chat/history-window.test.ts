import { applyHistoryWindow } from '@modules/chat/application/history-window';
import { ChatMessage } from '@modules/chat/domain/chatMessage.entity';

const createMessage = (id: string, iso: string): ChatMessage => {
  return {
    id,
    role: 'user',
    text: id,
    imageRef: null,
    metadata: null,
    createdAt: new Date(iso),
    session: undefined as never,
    artworkMatches: [],
  } as ChatMessage;
};

describe('applyHistoryWindow', () => {
  it('keeps the latest messages ordered by createdAt', () => {
    const history = [
      createMessage('m2', '2026-01-01T00:00:02.000Z'),
      createMessage('m1', '2026-01-01T00:00:01.000Z'),
      createMessage('m3', '2026-01-01T00:00:03.000Z'),
    ];

    const result = applyHistoryWindow(history, 2);

    expect(result.map((item) => item.id)).toEqual(['m2', 'm3']);
  });

  it('returns an empty array for non-positive limits', () => {
    const result = applyHistoryWindow([
      createMessage('m1', '2026-01-01T00:00:01.000Z'),
    ], 0);

    expect(result).toEqual([]);
  });
});
