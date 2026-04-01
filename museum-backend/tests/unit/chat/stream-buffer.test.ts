import { StreamBuffer } from '@modules/chat/application/stream-buffer';
import type { GuardrailBlockReason } from '@modules/chat/application/art-topic-guardrail';

describe('StreamBuffer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── Phase 1 (buffering) ─────────────────────────────────────────────

  describe('Phase 1 — buffering', () => {
    it('does not release tokens during phase 1', () => {
      const released: string[] = [];
      const classifier = { isArtRelated: jest.fn().mockResolvedValue(true) };
      const buf = new StreamBuffer({ classifier, tokenThreshold: 5 });
      buf.onRelease((t) => released.push(t));

      buf.push('hello');
      buf.push(' world');
      jest.advanceTimersByTime(500);

      expect(released).toHaveLength(0);
      buf.destroy();
    });

    it('runs classifier when threshold reached and releases on art=true', async () => {
      const released: string[] = [];
      let resolveClassifier!: (v: boolean) => void;
      const classifierPromise = new Promise<boolean>((r) => {
        resolveClassifier = r;
      });
      const classifier = { isArtRelated: jest.fn().mockReturnValue(classifierPromise) };
      const buf = new StreamBuffer({
        classifier,
        tokenThreshold: 3,
        releaseIntervalMs: 10,
      });
      buf.onRelease((t) => released.push(t));

      buf.push('a');
      buf.push('b');
      buf.push('c');

      // Classifier should have been called
      expect(classifier.isArtRelated).toHaveBeenCalledTimes(1);
      expect(classifier.isArtRelated).toHaveBeenCalledWith('abc');

      // Still in phase 1 — nothing released yet
      jest.advanceTimersByTime(100);
      expect(released).toHaveLength(0);

      // Resolve classifier → phase 2
      resolveClassifier(true);
      await buf.awaitPhase1();

      // Advance timers to drain
      jest.advanceTimersByTime(50);
      expect(released.length).toBeGreaterThan(0);

      buf.destroy();
    });

    it('sends guardrail event when classifier says not-art', async () => {
      const guardrailEvents: { text: string; reason: GuardrailBlockReason }[] = [];
      const classifier = { isArtRelated: jest.fn().mockResolvedValue(false) };
      const buf = new StreamBuffer({
        classifier,
        tokenThreshold: 2,
        onGuardrail: (text, reason) => guardrailEvents.push({ text, reason }),
      });

      buf.push('a');
      buf.push('b');

      await buf.awaitPhase1();

      expect(guardrailEvents).toHaveLength(1);
      expect(guardrailEvents[0].reason).toBe('off_topic');
      expect(buf.isDone()).toBe(true);

      buf.destroy();
    });

    it('fail-open: releases buffer when classifier throws', async () => {
      const released: string[] = [];
      const classifier = {
        isArtRelated: jest.fn().mockRejectedValue(new Error('LLM down')),
      };
      const buf = new StreamBuffer({
        classifier,
        tokenThreshold: 2,
        releaseIntervalMs: 10,
      });
      buf.onRelease((t) => released.push(t));

      buf.push('a');
      buf.push('b');

      await buf.awaitPhase1();
      jest.advanceTimersByTime(50);

      expect(released.length).toBeGreaterThan(0);
      expect(buf.isDone()).toBe(false); // still draining, not finished

      buf.destroy();
    });

    it('blocks on insult keyword during phase 1', () => {
      const guardrailEvents: { text: string; reason: GuardrailBlockReason }[] = [];
      const classifier = { isArtRelated: jest.fn().mockResolvedValue(true) };
      const buf = new StreamBuffer({
        classifier,
        tokenThreshold: 100,
        onGuardrail: (text, reason) => guardrailEvents.push({ text, reason }),
      });

      buf.push('you are an ');
      buf.push('idiot');

      expect(guardrailEvents).toHaveLength(1);
      expect(guardrailEvents[0].reason).toBe('insult');
      expect(buf.isDone()).toBe(true);

      // Classifier should NOT have been called since we blocked early
      expect(classifier.isArtRelated).not.toHaveBeenCalled();

      buf.destroy();
    });
  });

  // ── Phase 2 (drain) ─────────────────────────────────────────────────

  describe('Phase 2 — drain', () => {
    it('drains tokens at steady interval', async () => {
      const released: string[] = [];
      const classifier = { isArtRelated: jest.fn().mockResolvedValue(true) };
      const buf = new StreamBuffer({
        classifier,
        tokenThreshold: 3,
        releaseIntervalMs: 10,
      });
      buf.onRelease((t) => released.push(t));

      buf.push('a');
      buf.push('b');
      buf.push('c');
      buf.push('d');
      buf.push('e');

      await buf.awaitPhase1();

      // Each tick releases one token
      jest.advanceTimersByTime(10);
      expect(released).toEqual(['a']);

      jest.advanceTimersByTime(10);
      expect(released).toEqual(['a', 'b']);

      jest.advanceTimersByTime(10);
      expect(released).toEqual(['a', 'b', 'c']);

      buf.destroy();
    });

    it('stops draining at [META] marker — no [META] content leaks', async () => {
      const released: string[] = [];
      const classifier = { isArtRelated: jest.fn().mockResolvedValue(true) };
      const buf = new StreamBuffer({
        classifier,
        tokenThreshold: 2,
        releaseIntervalMs: 10,
      });
      buf.onRelease((t) => released.push(t));

      buf.push('answer');
      buf.push(' text');
      // [META] marker arrives
      buf.push('\n[META]');
      buf.push('{"key":"value"}');

      await buf.awaitPhase1();

      // Drain all tokens
      jest.advanceTimersByTime(200);

      // Only the answer text should have been released
      expect(released.join('')).toBe('answer text');
      expect(released.join('')).not.toContain('[META]');
      expect(buf.isDone()).toBe(true);

      buf.destroy();
    });

    it('handles short response (< threshold tokens, finish() triggers early)', async () => {
      const released: string[] = [];
      const classifier = { isArtRelated: jest.fn().mockResolvedValue(true) };
      const buf = new StreamBuffer({
        classifier,
        tokenThreshold: 100,
        releaseIntervalMs: 10,
      });
      buf.onRelease((t) => released.push(t));

      buf.push('hi');
      buf.finish();

      await buf.awaitPhase1();
      expect(classifier.isArtRelated).toHaveBeenCalledTimes(1);

      // Drain
      jest.advanceTimersByTime(50);
      expect(released).toEqual(['hi']);
      expect(buf.isDone()).toBe(true);

      buf.destroy();
    });
  });

  // ── No classifier configured ────────────────────────────────────────

  describe('No classifier configured', () => {
    it('still buffers for jitter smoothing then drains normally', async () => {
      const released: string[] = [];
      const buf = new StreamBuffer({
        tokenThreshold: 3,
        releaseIntervalMs: 10,
      });
      buf.onRelease((t) => released.push(t));

      buf.push('a');
      buf.push('b');
      buf.push('c');

      await buf.awaitPhase1();

      jest.advanceTimersByTime(10);
      expect(released).toEqual(['a']);

      jest.advanceTimersByTime(20);
      expect(released).toEqual(['a', 'b', 'c']);

      buf.finish();
      jest.advanceTimersByTime(10);
      expect(buf.isDone()).toBe(true);

      buf.destroy();
    });
  });

  // ── Edge cases ──────────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('signal abort stops draining', async () => {
      const released: string[] = [];
      const controller = new AbortController();
      const classifier = { isArtRelated: jest.fn().mockResolvedValue(true) };
      const buf = new StreamBuffer({
        classifier,
        tokenThreshold: 2,
        releaseIntervalMs: 10,
        signal: controller.signal,
      });
      buf.onRelease((t) => released.push(t));

      buf.push('a');
      buf.push('b');
      buf.push('c');
      buf.push('d');

      await buf.awaitPhase1();

      jest.advanceTimersByTime(10);
      expect(released).toEqual(['a']);

      controller.abort();

      jest.advanceTimersByTime(100);
      // Should not have released any more tokens after abort
      expect(released).toEqual(['a']);
      expect(buf.isDone()).toBe(true);

      buf.destroy();
    });

    it('push() after blocked is no-op', () => {
      const guardrailEvents: { text: string; reason: GuardrailBlockReason }[] = [];
      const buf = new StreamBuffer({
        tokenThreshold: 100,
        onGuardrail: (text, reason) => guardrailEvents.push({ text, reason }),
      });

      buf.push('you idiot');
      expect(guardrailEvents).toHaveLength(1);

      // Subsequent push should be ignored
      buf.push('more text');
      expect(guardrailEvents).toHaveLength(1);
      expect(buf.isDone()).toBe(true);

      buf.destroy();
    });

    it('push() after done is no-op', async () => {
      const released: string[] = [];
      const buf = new StreamBuffer({
        tokenThreshold: 1,
        releaseIntervalMs: 10,
      });
      buf.onRelease((t) => released.push(t));

      buf.push('a');
      buf.finish();

      await buf.awaitPhase1();
      jest.advanceTimersByTime(50);

      expect(buf.isDone()).toBe(true);
      const countBefore = released.length;

      buf.push('late');
      jest.advanceTimersByTime(50);
      expect(released.length).toBe(countBefore);

      buf.destroy();
    });
  });
});
