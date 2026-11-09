export function repeatedChar(char: string, length: number): string {
  return char.repeat(length);
}

export function alternatingChars(a: string, b: string, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += i % 2 === 0 ? a : b;
  return out;
}

export function catastrophicBacktrack(prefix: string, length: number, tail = '!'): string {
  return prefix.repeat(length) + tail;
}

export const ZERO_WIDTH = '​‌‍﻿';

export const BIDI_MARKS = '‪‫‬‭‮';

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
