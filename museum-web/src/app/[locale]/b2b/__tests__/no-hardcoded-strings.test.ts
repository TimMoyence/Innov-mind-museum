/**
 * R4 RED — no-hardcoded-marketing-string source-grep test.
 *
 * Pins R4 §1 R5 + AC5 + AC12 down BEFORE implementation: every visible string
 * in `page.tsx` and `B2bContactForm.tsx` MUST come from `dict.landing.b2b.*`.
 * No raw FR/EN marketing literal allowed in TSX.
 *
 * MUST FAIL at baseline because the TSX files don't exist — `readFileSync`
 * throws ENOENT, which the test asserts is recoverable but currently is not.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PAGE = resolve(__dirname, '..', 'page.tsx');
const FORM = resolve(__dirname, '..', 'B2bContactForm.tsx');

// Forbidden literals — any of these inside a TSX file means an i18n key was
// missed. Keep this list narrow: only strings that the spec calls out as
// canonical copy + a few common french/english marketing words.
const FORBIDDEN = [
  'Sur devis',
  'Custom pricing',
  'Director',
  'Conservateur',
  'Voice-first',
  'Voice first',
  // canonical R4 pricing slogan, must live in JSON dict only
  'pricing adapté',
  'museum size',
];

function readTsx(file: string): string {
  expect(existsSync(file), `${file} must exist (R4 T2)`).toBe(true);
  return readFileSync(file, 'utf8');
}

describe('B2B production TSX has no hard-coded marketing strings (R5 / AC5)', () => {
  it('page.tsx and B2bContactForm.tsx exist', () => {
    expect(existsSync(PAGE)).toBe(true);
    expect(existsSync(FORM)).toBe(true);
  });

  it.each(FORBIDDEN)('page.tsx does not contain forbidden literal: %s', (literal) => {
    const src = readTsx(PAGE);
    // ignore the import path noise — only scan JSX/string-literal occurrences.
    expect(src).not.toMatch(new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  });

  it.each(FORBIDDEN)('B2bContactForm.tsx does not contain forbidden literal: %s', (literal) => {
    const src = readTsx(FORM);
    expect(src).not.toMatch(new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  });
});
