/**
 * T6.2 guard (R13) — no hard-coded MFA UX strings in LoginForm.tsx.
 *
 * Per the architect string-guard contract (CLAUDE.md / agent context, mirror of
 * `BetaSignupSection.no-hardcoded-strings.test.ts`):
 *   - per-LINE source scan (a quote on one line can't bleed into a later line).
 *   - FORBIDDEN = multi-word UX phrases ONLY (>=2 words). Single tokens like
 *     'Verify' / '123456' are excluded (they collide with dict keys / values).
 *   - matched only inside a quoted string literal OR as JSX text between > and <.
 *   - bare identifiers (e.g. `dict.mfaTitle`) and property access are NOT matched.
 *
 * GUARD (passes today — current LoginForm has none of these phrases; passes
 * against T5.3 as long as all challenge copy comes from `dict.*`). FAILS only if
 * a multi-word MFA phrase is hardcoded in the TSX.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const LOGIN_FORM = resolve(__dirname, '..', 'LoginForm.tsx');

// Multi-word UX phrases that MUST live in the dictionary (en values, see
// admin-dict.fixture / dictionaries). Each is the canonical English copy.
const FORBIDDEN = [
  'Two-factor authentication',
  'Enter the 6-digit code',
  'Authentication code',
  'Verify and sign in',
  'Use a recovery code',
  'Recovery code',
  'Sign in with recovery code',
  'Back to authenticator code',
  'That code is incorrect',
  'Too many attempts',
  'Your session expired',
  'recovery codes remaining',
];

function escape(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * True if `literal` (case-insensitive) appears inside a single-line quoted
 * string literal (`'…'`, `"…"`, backtick-…-backtick) or as JSX text between
 * `>` and `<` on one line. Bare identifier / dict-key access matches are
 * intentionally NOT flagged.
 */
function sourceContainsForbidden(src: string, literal: string): boolean {
  const esc = escape(literal);
  const inQuote = new RegExp(`(['"\`])[^'"\`\\n]*${esc}[^'"\`\\n]*\\1`, 'i');
  const inJsx = new RegExp(`>[^<\\n]*${esc}[^<\\n]*<`, 'i');
  return src.split('\n').some((line) => inQuote.test(line) || inJsx.test(line));
}

function readTsx(): string {
  expect(existsSync(LOGIN_FORM), `${LOGIN_FORM} must exist`).toBe(true);
  return readFileSync(LOGIN_FORM, 'utf8');
}

describe('LoginForm.tsx has no hard-coded MFA UX strings (R13)', () => {
  it.each(FORBIDDEN)('does not contain forbidden literal in source string/JSX: %s', (literal) => {
    expect(sourceContainsForbidden(readTsx(), literal)).toBe(false);
  });
});
