/**
 * R2 RED — no hard-coded marketing/UX strings in the export TSX component.
 *
 * Pins R2 §1 R25 + N12 + AC17 down BEFORE implementation: every visible
 * string in `ExportCsvButton.tsx` MUST come from `dict.admin.export.*`. No
 * raw FR/EN literal allowed in TSX.
 *
 * Uses the same tightened R3 forbidden-string regex pattern (per-line quoted
 * scan + JSX-text scan) so `dict.<key>` identifier accesses don't false-flag.
 *
 * MUST FAIL at baseline `a77e48aa` — the TSX file doesn't exist, so the
 * `existsSync` precondition assertion fails.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const COMPONENT = resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'components',
  'admin',
  'ExportCsvButton.tsx',
);

// Forbidden literals — canonical UX copy that MUST live in JSON dict only.
//
// R2 corrective loop 1 (2026-05-15) : single-word entries `Export`/`Exporter`/
// `Failed` removed — they false-flagged on legitimate non-UX strings like the
// `/api/admin/export/` URL path inside `ExportCsvButton.tsx`. Multi-word UX
// phrases stay (`Export CSV`, `Export sessions`, etc.) — they cannot collide
// with paths or identifiers. Mirrors the R3 corrective loop 1 doctrine
// (BetaSignupSection.no-hardcoded-strings.test.ts) of tightening forbidden
// regex scope to actual UX-shaped strings rather than over-broad substrings.
const FORBIDDEN = [
  'Téléchargement',
  'Téléchargement en cours',
  'Téléchargement terminé',
  'Téléchargement...',
  'Erreur lors du téléchargement',
  'Réessayez',
  'Export CSV',
  'Exporter en CSV',
  'Downloading',
  'Downloading...',
  'Download complete',
  'Try again',
  'Export sessions',
  'Export reviews',
  'Export tickets',
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
  expect(existsSync(file), `${file} must exist (R2 T2)`).toBe(true);
  return readFileSync(file, 'utf8');
}

describe('ExportCsvButton.tsx has no hard-coded UX strings (R2 R25 / AC17)', () => {
  it('ExportCsvButton.tsx exists', () => {
    expect(existsSync(COMPONENT)).toBe(true);
  });

  it.each(FORBIDDEN)('does not contain forbidden literal in source string/JSX: %s', (literal) => {
    const src = readTsx(COMPONENT);
    expect(sourceContainsForbidden(src, literal)).toBe(false);
  });
});
