/**
 * T-WEB-3 (RED) — C2 / S-WEB — no hard-coded UX strings in the NPS dashboard.
 *
 * Pins R24/R27 copy discipline BEFORE implementation: every visible UX phrase
 * in `app/[locale]/admin/nps/page.tsx` MUST come from the admin dictionary
 * (`adminDict.npsPage.*` / `adminDict.common.*`). No raw FR/EN literal allowed
 * in the source.
 *
 * Per the verbatim per-component contract (CLAUDE.md / editor.md):
 *  - source scan is PER LINE (`src.split('\n').some(...)`), never whole-file;
 *  - the FORBIDDEN list is MULTI-WORD UX phrases only (≥2 words) so the regex
 *    never collides with a TS property key, an identifier, or a URL path;
 *  - match form = quoted-string literals OR JSX-text content only;
 *  - `String.fromCharCode` / char-array / dict-key-alias evasions are a
 *    BLOCKER, not a fix.
 *
 * MUST FAIL at baseline: the page file does not exist, so the `existsSync`
 * precondition assertion fails (red success).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PAGE = resolve(__dirname, '..', 'nps', 'page.tsx');

// Forbidden literals — canonical multi-word UX copy. Each phrase is at least
// two words so the regex never collides with a JS property name or a path.
const FORBIDDEN = [
  // English
  'Net Promoter Score',
  'How likely',
  'No data available',
  // French
  'Score de recommandation',
  'Aucune donnée',
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
  expect(existsSync(file), `${file} must exist (T-WEB-3)`).toBe(true);
  return readFileSync(file, 'utf8');
}

describe('admin/nps/page.tsx has no hard-coded UX strings (R24/R27 copy discipline)', () => {
  it('nps/page.tsx exists', () => {
    expect(existsSync(PAGE)).toBe(true);
  });

  it.each(FORBIDDEN)('does not contain forbidden literal in source string/JSX: %s', (literal) => {
    const src = readTsx(PAGE);
    expect(sourceContainsForbidden(src, literal)).toBe(false);
  });
});
