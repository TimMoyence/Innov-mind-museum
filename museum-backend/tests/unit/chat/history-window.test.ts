import { applyHistoryWindow } from '@modules/chat/useCase/history-window';
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

      // maxTokens = 0 is falsy, so the token-trimming branch is skipped — but
      // explicitly passing 0 means we rely on `maxTokens && maxTokens > 0` being false.
      // The function returns the maxMessages-trimmed slice without further token trimming.
      const result = applyHistoryWindow(history, 10, 0);

      // 0 is falsy so the token budget branch is skipped; messages pass through
      expect(result).toHaveLength(1);
    });

    it('trims oldest messages when token budget is exceeded', () => {
      // Each char ~ 0.25 tokens, so 40 chars ~ 10 tokens
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

      // Budget = 15 tokens, each message is ~10 tokens → only 1 fits
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

      // Budget = 25 tokens, each message is ~10 tokens → 2 fit
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

      // 400 chars ~ 100 tokens, budget = 5
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

      // maxMessages = 2 limits before token budget kicks in. Budget = 1000 (very generous).
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

      // null text → '' → 0 tokens, so both fit in any budget
      const result = applyHistoryWindow(history, 10, 100);

      expect(result).toHaveLength(2);
    });

    it('keeps message when totalTokens exactly equals maxTokens (> not >=)', () => {
      // 20 chars → Math.ceil(20/4) = 5 tokens each; 3 messages = 15 tokens total
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

      // maxTokens = 15, exactly enough for all 3 messages (5+5+5 = 15)
      const result = applyHistoryWindow(history, 10, 15);

      // With `>` (correct): 15 > 15 is false → all 3 kept
      // With `>=` (mutant): 15 >= 15 is true → only 2 kept → test fails → mutant killed
      expect(result).toHaveLength(3);
      expect(result.map((item) => item.id)).toEqual(['m1', 'm2', 'm3']);
    });

    it('skips token trimming when maxTokens is undefined', () => {
      // Each message has a large text that would exceed a typical token budget
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

      // No maxTokens → token trimming branch skipped entirely
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

      // m2: 8 chars → ceil(8/4) = 2 tokens; m1: null → '' → 0 tokens; total = 2
      // maxTokens = 2 → both fit (0 + 2 = 2, and 2 > 2 is false)
      const result = applyHistoryWindow(history, 10, 2);

      expect(result).toHaveLength(2);
      expect(result.map((item) => item.id)).toEqual(['m1', 'm2']);
    });

    it('token budget drops oldest first preserving chronological order', () => {
      // 3 messages: 40 chars each → ceil(40/4) = 10 tokens each
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

      // Budget = 20 → fits 2 messages (10+10), drops oldest
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

      // maxTokens=0 → falsy → token trimming branch NOT entered → both messages returned
      const result = applyHistoryWindow(history, 10, 0);

      expect(result).toHaveLength(2);
      expect(result.map((item) => item.id)).toEqual(['m1', 'm2']);
    });
  });
});
