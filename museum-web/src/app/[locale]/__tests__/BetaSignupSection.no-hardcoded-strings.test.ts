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
// live in JSON dict only. Each literal is matched only when it appears inside
// a quoted string literal ('...', "...", `...`) or as JSX text between `>` and
// `<` — NOT as a property-key access (`dict.sending`) or variable identifier.
// This was tightened in loop 1 corrective : the prior naïve substring grep
// flagged `dict.sending` and forced a `PENDING_KEY` char-array workaround in
// the component.
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

/**
 * Returns true if `literal` (case-insensitive) appears inside a quoted string
 * literal (`'…'`, `"…"`, or backtick-…-backtick on a single line) or as JSX
 * text between `>` and `<` on a single line. Bare identifier matches
 * (e.g. `dict.sending`) and JSDoc backtick spans that happen to contain the
 * substring across lines are intentionally NOT matched.
 */
function sourceContainsForbidden(src: string, literal: string): boolean {
  const esc = escape(literal);
  // Per-line scan keeps the match scoped : a quote char on one line cannot
  // bleed into a forbidden substring many lines later (which was the case
  // when JSDoc backticks like `lib/i18n.ts` opened a "string" that swallowed
  // `dict.sending` two lines below).
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
