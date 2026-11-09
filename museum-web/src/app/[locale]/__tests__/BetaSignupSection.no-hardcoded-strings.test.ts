import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const SECTION = resolve(__dirname, '..', 'BetaSignupSection.tsx');

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

function escape(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sourceContainsForbidden(src: string, literal: string): boolean {
  const esc = escape(literal);
  const inQuote = new RegExp(`(['"\`])[^'"\`\\n]*${esc}[^'"\`\\n]*\\1`, 'i');
  const inJsx = new RegExp(`>[^<\\n]*${esc}[^<\\n]*<`, 'i');
  return src.split('\n').some((line) => inQuote.test(line) || inJsx.test(line));
}

function readTsx(file: string): string {
  expect(existsSync(file), `${file} must exist (R3 T2)`).toBe(true);
  return readFileSync(file, 'utf8');
}

describe('BetaSignupSection.tsx has no hard-coded marketing strings (R3 R5 / AC5)', () => {
  it('BetaSignupSection.tsx exists', () => {
    expect(existsSync(SECTION)).toBe(true);
  });

  it.each(FORBIDDEN)('does not contain forbidden literal in source string/JSX: %s', (literal) => {
    const src = readTsx(SECTION);
    expect(sourceContainsForbidden(src, literal)).toBe(false);
  });
});
