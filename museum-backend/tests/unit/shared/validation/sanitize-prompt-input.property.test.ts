/**
 * Property-based tests for sanitizePromptInput.
 *
 * V12 W6: complements example-based unit tests with fast-check generated inputs.
 * Catches edge cases (Unicode boundaries, control-char interleaving, idempotence
 * under repeated application) that the curated test suite misses.
 *
 * Properties asserted:
 *   P1 — idempotent : sanitize(sanitize(x)) === sanitize(x)
 *   P2 — bounded    : sanitize(x).length <= maxLength (default 200)
 *   P3 — no zero-width : sanitize(x) excludes U+200B-D, U+FEFF, U+2060, U+00AD
 *   P4 — no control char : sanitize(x) excludes \x00-\x08, \x0B, \x0C, \x0E-\x1F, \x7F
 *   P5 — NFC-normalized : sanitize(x) === sanitize(x).normalize('NFC')
 *   P6 — preserves printable text   : sanitize("museum") === "museum"
 */

import * as fc from 'fast-check';

import { sanitizePromptInput } from '@shared/validation/input';

const ZERO_WIDTH = /[​-‍﻿⁠­]/;
// eslint-disable-next-line no-control-regex -- mirror of production regex; test asserts stripping
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

describe('sanitizePromptInput — property tests (fast-check)', () => {
  it('P1 — idempotent across all unicode strings', () => {
    fc.assert(
      fc.property(fc.fullUnicodeString({ maxLength: 500 }), (input) => {
        const once = sanitizePromptInput(input);
        const twice = sanitizePromptInput(once);
        expect(twice).toBe(once);
      }),
      { numRuns: 200 },
    );
  });

  it('P2 — never exceeds maxLength', () => {
    fc.assert(
      fc.property(
        fc.fullUnicodeString({ maxLength: 1000 }),
        fc.integer({ min: 1, max: 500 }),
        (input, maxLength) => {
          const out = sanitizePromptInput(input, maxLength);
          expect(out.length).toBeLessThanOrEqual(maxLength);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('P3 — output never contains zero-width characters', () => {
    fc.assert(
      fc.property(fc.fullUnicodeString({ maxLength: 500 }), (input) => {
        const out = sanitizePromptInput(input);
        expect(ZERO_WIDTH.test(out)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it('P4 — output never contains stripped control characters', () => {
    fc.assert(
      fc.property(fc.fullUnicodeString({ maxLength: 500 }), (input) => {
        const out = sanitizePromptInput(input);
        expect(CONTROL_CHARS.test(out)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it('P5 — output is in NFC form', () => {
    fc.assert(
      fc.property(fc.fullUnicodeString({ maxLength: 500 }), (input) => {
        const out = sanitizePromptInput(input);
        expect(out).toBe(out.normalize('NFC'));
      }),
      { numRuns: 200 },
    );
  });

  it('P6 — preserves alphanumeric content (no false stripping)', () => {
    fc.assert(
      fc.property(
        fc
          .stringMatching(/^[a-zA-Z0-9 .,!?'-]{1,50}$/)
          // Trim leading/trailing whitespace to avoid the .trim() step shrinking length.
          .map((s) => s.trim())
          .filter((s) => s.length > 0),
        (input) => {
          expect(sanitizePromptInput(input)).toBe(input);
        },
      ),
      { numRuns: 200 },
    );
  });
});
