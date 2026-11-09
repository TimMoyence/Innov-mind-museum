import { applyHistoryWindow } from '@modules/chat/useCase/orchestration/history-window';
import { makeMessage } from '../../helpers/chat/message.fixtures';

describe('applyHistoryWindow', () => {
  it('returns empty array for empty input', () => {
    const result = applyHistoryWindow([], 10);

    expect(result).toEqual([]);
  });

  it('returns empty array when maxMessages is 0', () => {
    const msg = makeMessage({
      id: 'm1',
      text: 'hello',
      createdAt: new Date('2026-01-01T00:00:01.000Z'),
    });

    const result = applyHistoryWindow([msg], 0);

    expect(result).toEqual([]);
  });

  it('returns empty array when maxMessages is negative', () => {
    const msg = makeMessage({
      id: 'm1',
      text: 'hello',
      createdAt: new Date('2026-01-01T00:00:01.000Z'),
    });

    const result = applyHistoryWindow([msg], -5);

    expect(result).toEqual([]);
  });

  it('keeps the latest messages ordered by createdAt', () => {
    const history = [
      makeMessage({ id: 'm2', text: 'm2', createdAt: new Date('2026-01-01T00:00:02.000Z') }),
      makeMessage({ id: 'm1', text: 'm1', createdAt: new Date('2026-01-01T00:00:01.000Z') }),
      makeMessage({ id: 'm3', text: 'm3', createdAt: new Date('2026-01-01T00:00:03.000Z') }),
    ];

    const result = applyHistoryWindow(history, 2);

    expect(result.map((item) => item.id)).toEqual(['m2', 'm3']);
  });

  it('returns all messages when maxMessages exceeds history length', () => {
    const history = [
      makeMessage({ id: 'm1', text: 'first', createdAt: new Date('2026-01-01T00:00:01.000Z') }),
      makeMessage({ id: 'm2', text: 'second', createdAt: new Date('2026-01-01T00:00:02.000Z') }),
    ];

    const result = applyHistoryWindow(history, 10);

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.id)).toEqual(['m1', 'm2']);
  });

  describe('maxTokens — no token budget', () => {
    it('only applies maxMessages when maxTokens is not provided', () => {
      const history = [
        makeMessage({
          id: 'm1',
          text: 'a'.repeat(1000),
          createdAt: new Date('2026-01-01T00:00:01.000Z'),
        }),
        makeMessage({
          id: 'm2',
          text: 'b'.repeat(1000),
          createdAt: new Date('2026-01-01T00:00:02.000Z'),
        }),
        makeMessage({
          id: 'm3',
          text: 'c'.repeat(1000),
          createdAt: new Date('2026-01-01T00:00:03.000Z'),
        }),
      ];

      const result = applyHistoryWindow(history, 2);

      expect(result).toHaveLength(2);
      expect(result.map((item) => item.id)).toEqual(['m2', 'm3']);
    });
  });

  describe('maxTokens — token budget trimming', () => {
    it('returns empty array when maxTokens is 0', () => {
      const history = [
        makeMessage({ id: 'm1', text: 'hello', createdAt: new Date('2026-01-01T00:00:01.000Z') }),
      ];

      const result = applyHistoryWindow(history, 10, 0);

      expect(result).toHaveLength(1);
    });

    it('trims oldest messages when token budget is exceeded', () => {
      const history = [
        makeMessage({
          id: 'm1',
          text: 'a'.repeat(40),
          createdAt: new Date('2026-01-01T00:00:01.000Z'),
        }),
        makeMessage({
          id: 'm2',
          text: 'b'.repeat(40),
          createdAt: new Date('2026-01-01T00:00:02.000Z'),
        }),
        makeMessage({
          id: 'm3',
          text: 'c'.repeat(40),
          createdAt: new Date('2026-01-01T00:00:03.000Z'),
        }),
      ];

      const result = applyHistoryWindow(history, 10, 15);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('m3');
    });

    it('keeps multiple messages when token budget allows', () => {
      const history = [
        makeMessage({
          id: 'm1',
          text: 'a'.repeat(40),
          createdAt: new Date('2026-01-01T00:00:01.000Z'),
        }),
        makeMessage({
          id: 'm2',
          text: 'b'.repeat(40),
          createdAt: new Date('2026-01-01T00:00:02.000Z'),
        }),
        makeMessage({
          id: 'm3',
          text: 'c'.repeat(40),
          createdAt: new Date('2026-01-01T00:00:03.000Z'),
        }),
      ];

      const result = applyHistoryWindow(history, 10, 25);

      expect(result).toHaveLength(2);
      expect(result.map((item) => item.id)).toEqual(['m2', 'm3']);
    });

    it('returns empty when first message exceeds token budget', () => {
      const history = [
        makeMessage({
          id: 'm1',
          text: 'a'.repeat(400),
          createdAt: new Date('2026-01-01T00:00:01.000Z'),
        }),
      ];

      const result = applyHistoryWindow(history, 10, 5);

      expect(result).toEqual([]);
    });

    it('maxMessages constraint takes precedence when smaller than token budget allows', () => {
      const history = [
        makeMessage({
          id: 'm1',
          text: 'a'.repeat(4),
          createdAt: new Date('2026-01-01T00:00:01.000Z'),
        }),
        makeMessage({
          id: 'm2',
          text: 'b'.repeat(4),
          createdAt: new Date('2026-01-01T00:00:02.000Z'),
        }),
        makeMessage({
          id: 'm3',
          text: 'c'.repeat(4),
          createdAt: new Date('2026-01-01T00:00:03.000Z'),
        }),
        makeMessage({
          id: 'm4',
          text: 'd'.repeat(4),
          createdAt: new Date('2026-01-01T00:00:04.000Z'),
        }),
      ];

      const result = applyHistoryWindow(history, 2, 1000);

      expect(result).toHaveLength(2);
      expect(result.map((item) => item.id)).toEqual(['m3', 'm4']);
    });

    it('handles messages with null text gracefully (0 tokens)', () => {
      const history = [
        makeMessage({ id: 'm1', text: null, createdAt: new Date('2026-01-01T00:00:01.000Z') }),
        makeMessage({
          id: 'm2',
          text: 'hello world',
          createdAt: new Date('2026-01-01T00:00:02.000Z'),
        }),
      ];

      const result = applyHistoryWindow(history, 10, 100);

      expect(result).toHaveLength(2);
    });

    it('keeps message when totalTokens exactly equals maxTokens (> not >=)', () => {
      const history = [
        makeMessage({
          id: 'm1',
          text: 'a'.repeat(20),
          createdAt: new Date('2026-01-01T00:00:01.000Z'),
        }),
        makeMessage({
          id: 'm2',
          text: 'b'.repeat(20),
          createdAt: new Date('2026-01-01T00:00:02.000Z'),
        }),
        makeMessage({
          id: 'm3',
          text: 'c'.repeat(20),
          createdAt: new Date('2026-01-01T00:00:03.000Z'),
        }),
      ];

      const result = applyHistoryWindow(history, 10, 15);

      expect(result).toHaveLength(3);
      expect(result.map((item) => item.id)).toEqual(['m1', 'm2', 'm3']);
    });

    it('skips token trimming when maxTokens is undefined', () => {
      const history = [
        makeMessage({
          id: 'm1',
          text: 'x'.repeat(2000),
          createdAt: new Date('2026-01-01T00:00:01.000Z'),
        }),
        makeMessage({
          id: 'm2',
          text: 'y'.repeat(2000),
          createdAt: new Date('2026-01-01T00:00:02.000Z'),
        }),
      ];

      const result = applyHistoryWindow(history, 10);

      expect(result).toHaveLength(2);
      expect(result.map((item) => item.id)).toEqual(['m1', 'm2']);
    });

    it('null text message contributes 0 tokens to budget', () => {
      const history = [
        makeMessage({
          id: 'm1',
          text: null as unknown as string,
          createdAt: new Date('2026-01-01T00:00:01.000Z'),
        }),
        makeMessage({
          id: 'm2',
          text: 'a'.repeat(8),
          createdAt: new Date('2026-01-01T00:00:02.000Z'),
        }),
      ];

      const result = applyHistoryWindow(history, 10, 2);

      expect(result).toHaveLength(2);
      expect(result.map((item) => item.id)).toEqual(['m1', 'm2']);
    });

    it('token budget drops oldest first preserving chronological order', () => {
      const history = [
        makeMessage({
          id: 'old',
          text: 'a'.repeat(40),
          createdAt: new Date('2026-01-01T00:00:01.000Z'),
        }),
        makeMessage({
          id: 'mid',
          text: 'b'.repeat(40),
          createdAt: new Date('2026-01-01T00:00:02.000Z'),
        }),
        makeMessage({
          id: 'new',
          text: 'c'.repeat(40),
          createdAt: new Date('2026-01-01T00:00:03.000Z'),
        }),
      ];

      const result = applyHistoryWindow(history, 10, 20);

      expect(result).toHaveLength(2);
      expect(result.map((item) => item.id)).toEqual(['mid', 'new']);
    });

    it('negative maxMessages returns empty array', () => {
      const history = [
        makeMessage({ id: 'm1', text: 'hello', createdAt: new Date('2026-01-01T00:00:01.000Z') }),
        makeMessage({ id: 'm2', text: 'world', createdAt: new Date('2026-01-01T00:00:02.000Z') }),
      ];

      const result = applyHistoryWindow(history, -1);

      expect(result).toEqual([]);
    });

    it('maxTokens zero is falsy and skips token trimming', () => {
      const history = [
        makeMessage({
          id: 'm1',
          text: 'a'.repeat(800),
          createdAt: new Date('2026-01-01T00:00:01.000Z'),
        }),
        makeMessage({
          id: 'm2',
          text: 'b'.repeat(800),
          createdAt: new Date('2026-01-01T00:00:02.000Z'),
        }),
      ];

      const result = applyHistoryWindow(history, 10, 0);

      expect(result).toHaveLength(2);
      expect(result.map((item) => item.id)).toEqual(['m1', 'm2']);
    });
  });
});
