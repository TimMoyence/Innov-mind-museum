/**
 * R3 RED — no-hardcoded-marketing-string source-grep test.
 *
 * Pins R3 §1 R5 + AC5 + AC11 + N4 down BEFORE implementation: every visible
 * string in `BetaSignupSection.tsx` MUST come from `dict.landing.beta.*`.
 * No raw FR/EN marketing literal allowed in TSX.
 *
 * MUST FAIL at baseline `d5919dd3` — the TSX file doesn't exist, so the
 * `existsSync` precondition assertion fails.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const SECTION = resolve(__dirname, '..', 'BetaSignupSection.tsx');

// Forbidden literals — strings the spec calls out as canonical copy that MUST
// live in JSON dict only. Lowercased substring matching.
const FORBIDDEN = [
  'Merci',
  'Thanks',
  'Inscris-toi',
  'Sign up',
  "M'inscrire",
  'Sign me up',
  'Je consens',
  'I agree to receive',
  'Adresse email',
  'Rejoins la bêta',
  'Join the pre-launch beta',
  'Envoi',
  'Sending',
];

function readTsx(file: string): string {
  expect(existsSync(file), `${file} must exist (R3 T2)`).toBe(true);
  return readFileSync(file, 'utf8');
}

describe('BetaSignupSection.tsx has no hard-coded marketing strings (R3 R5 / AC5)', () => {
  it('BetaSignupSection.tsx exists', () => {
    expect(existsSync(SECTION)).toBe(true);
  });

  it.each(FORBIDDEN)('does not contain forbidden literal: %s', (literal) => {
    const src = readTsx(SECTION);
    expect(src).not.toMatch(new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  });
});
