import { applyHistoryWindow } from '@modules/chat/application/history-window';
import { makeMessage } from '../../helpers/chat/message.fixtures';

describe('applyHistoryWindow', () => {
  it('keeps the latest messages ordered by createdAt', () => {
    const history = [
      makeMessage({
        id: 'm2',
        text: 'm2',
        createdAt: new Date('2026-01-01T00:00:02.000Z'),
      }),
      makeMessage({
        id: 'm1',
        text: 'm1',
        createdAt: new Date('2026-01-01T00:00:01.000Z'),
      }),
      makeMessage({
        id: 'm3',
        text: 'm3',
        createdAt: new Date('2026-01-01T00:00:03.000Z'),
      }),
    ];

    const result = applyHistoryWindow(history, 2);

    expect(result.map((item) => item.id)).toEqual(['m2', 'm3']);
  });

  it('returns an empty array for non-positive limits', () => {
    const msg = makeMessage({
      id: 'm1',
      text: 'm1',
      createdAt: new Date('2026-01-01T00:00:01.000Z'),
    });
    const result = applyHistoryWindow([msg], 0);

    expect(result).toEqual([]);
  });
});
