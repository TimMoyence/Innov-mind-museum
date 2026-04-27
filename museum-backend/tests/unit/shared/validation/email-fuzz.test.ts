/**
 * P3.4 — Email validation fuzz tests.
 *
 * `validateEmail` is the only regex on the user signup / login / password
 * reset paths. Even though the pattern is anchored and uses a negated
 * character class (no nested quantifier), this suite proves the claim
 * empirically against the full adversarial deck — and also serves as a
 * regression net if the regex is ever rewritten.
 *
 * Threshold: 50ms per input (a real ReDoS would blow past seconds).
 *
 * Uses the shared adversarial-strings factory (no inline string fixtures —
 * UFR-002).
 */

import { validateEmail } from '@src/shared/validation/email';
import {
  assertCompletesWithin,
  buildAdversarialDeck,
  catastrophicBacktrack,
} from '../../../helpers/shared/adversarial-strings';

const MAX_MS = 50;

describe('validateEmail — fuzz (P3.4)', () => {
  describe('positive cases', () => {
    it.each([
      'user@example.com',
      'first.last@example.co.uk',
      'with+tag@example.com',
      'unicode-éàç@example.com',
      'numeric123@example.io',
      'with-dash@sub.example.org',
    ])('accepts %s', (email) => {
      const { result } = assertCompletesWithin(() => validateEmail(email), MAX_MS, 'positive');
      expect(result).toBe(true);
    });
  });

  describe('negative cases', () => {
    it.each([
      ['empty string', ''],
      ['missing @', 'user.example.com'],
      ['missing TLD', 'user@example'],
      ['whitespace in local', 'with space@example.com'],
      ['whitespace in domain', 'user@example .com'],
      ['double @', 'user@@example.com'],
      ['leading @', '@example.com'],
      ['trailing @', 'user@'],
      ['only TLD', '@.com'],
    ])('rejects %s', (_label, email) => {
      const { result } = assertCompletesWithin(() => validateEmail(email), MAX_MS, 'negative');
      expect(result).toBe(false);
    });
  });

  describe('adversarial deck', () => {
    const deck = buildAdversarialDeck('a');
    it.each(deck.map((s) => [s.name, s.input]))('completes within budget for %s', (name, input) => {
      // Don't assert truth value — only that it terminates fast.
      const { durationMs } = assertCompletesWithin(
        () => validateEmail(input),
        MAX_MS,
        `email:${name}`,
      );
      expect(durationMs).toBeLessThan(MAX_MS);
    });
  });

  describe('ReDoS specific patterns', () => {
    it('terminates fast on catastrophic-backtrack-style local part', () => {
      const input = `${catastrophicBacktrack('a', 50)}@example.com`;
      const { durationMs, result } = assertCompletesWithin(
        () => validateEmail(input),
        MAX_MS,
        'redos:local',
      );
      // Tail '!' is allowed in local part, so it actually validates.
      expect(result).toBe(true);
      expect(durationMs).toBeLessThan(MAX_MS);
    });

    it('terminates fast on catastrophic-backtrack-style domain', () => {
      const input = `user@${catastrophicBacktrack('a', 50)}.com`;
      const { durationMs } = assertCompletesWithin(
        () => validateEmail(input),
        MAX_MS,
        'redos:domain',
      );
      expect(durationMs).toBeLessThan(MAX_MS);
    });

    it('terminates fast on extremely long input (10k @ + dots)', () => {
      const input = `${'a'.repeat(5_000)}@${'b'.repeat(5_000)}.com`;
      const { durationMs } = assertCompletesWithin(
        () => validateEmail(input),
        MAX_MS,
        'redos:long',
      );
      expect(durationMs).toBeLessThan(MAX_MS);
    });

    it('rejects input where local part contains @ even after long prefix', () => {
      const input = `${'a'.repeat(1_000)}@${'b'.repeat(1_000)}@example.com`;
      const { result, durationMs } = assertCompletesWithin(
        () => validateEmail(input),
        MAX_MS,
        'redos:double-at',
      );
      // The negated character class [^\s@] forbids '@' in local/domain — so
      // the second @ makes the whole input fail. Still must terminate fast.
      expect(result).toBe(false);
      expect(durationMs).toBeLessThan(MAX_MS);
    });
  });

  describe('random fuzz batch', () => {
    /**
     * 200 randomly-shaped strings (printable ASCII + a few special bytes).
     * Asserts every call returns within budget. Run is deterministic via a
     * fixed seed so test failures reproduce locally.
     * @param seed
     */
    function pseudoRandom(seed: number): () => number {
      let s = seed >>> 0;
      return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0x100000000;
      };
    }

    it('200 random inputs all complete within budget', () => {
      const rng = pseudoRandom(0xc0ffee);
      const charset = 'abcdefghijklmnopqrstuvwxyz0123456789 .@-_+#$';
      let worstMs = 0;
      for (let i = 0; i < 200; i++) {
        const len = Math.floor(rng() * 200) + 1;
        let s = '';
        for (let j = 0; j < len; j++) {
          s += charset[Math.floor(rng() * charset.length)];
        }
        const { durationMs } = assertCompletesWithin(
          () => validateEmail(s),
          MAX_MS,
          `random[${i}]`,
        );
        if (durationMs > worstMs) worstMs = durationMs;
      }
      expect(worstMs).toBeLessThan(MAX_MS);
    });
  });
});
