/**
 * Shared adversarial string factory — produces inputs designed to stress
 * regex engines (ReDoS), text sanitizers, and length-bounded paths.
 *
 * Use these in fuzz tests for any user-supplied string parsed by a regex.
 * Each helper has a predictable, deterministic shape so failures are
 * reproducible across CI runs.
 */

/**
 * Repetition of a single char up to {@link length}. Trivial worst-case.
 * @param char
 * @param length
 */
export function repeatedChar(char: string, length: number): string {
  return char.repeat(length);
}

/**
 * Two alternating chars — defeats naive prefix anchoring.
 * @param a
 * @param b
 * @param length
 */
export function alternatingChars(a: string, b: string, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += i % 2 === 0 ? a : b;
  return out;
}

/**
 * Classic ReDoS catastrophic backtracking trigger:
 * a long run of "a" followed by a single non-matching tail.
 * Defeats any pattern with overlapping `(a+)+` style alternation.
 * @param prefix
 * @param length
 * @param tail
 */
export function catastrophicBacktrack(prefix: string, length: number, tail = '!'): string {
  return prefix.repeat(length) + tail;
}

/** Zero-width chars and unicode noise — for sanitizers that strip control bytes. */
export const ZERO_WIDTH = '​‌‍﻿';

/** Bidirectional override marks — used in homograph attacks. */
export const BIDI_MARKS = '‪‫‬‭‮';

/**
 * A standard deck of adversarial samples for any string-input regex test.
 * Shape:
 *   - 'plain':   shortest happy path
 *   - 'long':    1k chars of one symbol
 *   - 'huge':    10k chars
 *   - 'redos':   classic catastrophic backtrack pattern
 *   - 'unicode': zero-width + bidi noise
 *   - 'mixed':   alternating chars at 1k length
 */
export interface AdversarialSample {
  name: string;
  input: string;
}

export function buildAdversarialDeck(seedChar = 'a'): AdversarialSample[] {
  return [
    { name: 'plain', input: seedChar },
    { name: 'long', input: repeatedChar(seedChar, 1_000) },
    { name: 'huge', input: repeatedChar(seedChar, 10_000) },
    {
      name: 'redos',
      input: catastrophicBacktrack(seedChar, 30, '!'),
    },
    { name: 'unicode', input: `${ZERO_WIDTH}${seedChar}${BIDI_MARKS}` },
    { name: 'mixed', input: alternatingChars(seedChar, 'b', 1_000) },
  ];
}

/**
 * Asserts that `fn()` returns within `maxMs` milliseconds. Wraps the inner
 * call with a high-resolution timer; throws a readable error if it overruns.
 *
 * Note: this is a smoke threshold, not a benchmark. ReDoS catastrophes
 * typically blow past seconds, so a 50ms ceiling is plenty conservative.
 * @param fn
 * @param maxMs
 * @param label
 */
export function assertCompletesWithin<T>(
  fn: () => T,
  maxMs: number,
  label: string,
): { result: T; durationMs: number } {
  const start = process.hrtime.bigint();
  const result = fn();
  const end = process.hrtime.bigint();
  const durationMs = Number(end - start) / 1_000_000;
  if (durationMs > maxMs) {
    throw new Error(
      `[fuzz:${label}] expected to complete within ${maxMs}ms but took ${durationMs.toFixed(2)}ms`,
    );
  }
  return { result, durationMs };
}
