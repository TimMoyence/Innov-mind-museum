import { sessionsByRecency } from '@/features/chat/infrastructure/chatSessionStore';

const session = (updatedAt: number) => ({
  messages: [],
  title: null,
  museumName: null,
  updatedAt,
});

describe('sessionsByRecency', () => {
  it('returns nothing for an empty notebook', () => {
    expect(sessionsByRecency({})).toEqual([]);
  });

  it('orders sessions from the most to the least recently updated, whatever the insertion order', () => {
    const ordered = sessionsByRecency({
      old: session(1000),
      newest: session(9999),
      middle: session(5000),
    });

    expect(ordered.map(([id]) => id)).toEqual(['newest', 'middle', 'old']);
  });

  it('keeps the insertion order between sessions updated at the same instant', () => {
    const ordered = sessionsByRecency({ first: session(42), second: session(42) });

    expect(ordered.map(([id]) => id)).toEqual(['first', 'second']);
  });
});
