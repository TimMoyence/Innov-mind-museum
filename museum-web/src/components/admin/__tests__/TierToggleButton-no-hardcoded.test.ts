/**
 * R1 RED — no hard-coded UX strings in TierToggleButton.tsx (T1.16 — M in brief).
 *
 * Pins R1 §1 R34 + N8 + AC18 down BEFORE implementation : every visible
 * string in `TierToggleButton.tsx` MUST come from
 * `dict.admin.userDetailPage.tier.*`. No raw FR/EN literal allowed in TSX.
 *
 * R3+R2 corrective doctrine applies : FORBIDDEN list contains MULTI-WORD UX
 * phrases only. Single-word entries like `Premium` / `Free` are excluded
 * because they collide with TS property keys (`user.tier === 'free'`,
 * `dict.tier.currentPremium`) and trigger false positives. Multi-word
 * forbidden literals can never collide with identifiers or URL paths.
 *
 * MUST FAIL at baseline `cd7e22bc` — the file
 * `src/components/admin/TierToggleButton.tsx` does not exist, so the
 * `existsSync` precondition assertion fails.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const COMPONENT = resolve(__dirname, '..', 'TierToggleButton.tsx');

// Forbidden literals — canonical multi-word UX copy. Each phrase is at least
// two words so the regex never collides with a JS property name or a path
// segment. Mirror the R3+R2 corrective loop doctrine.
const FORBIDDEN = [
  // English
  'Promote to premium',
  'Demote to free',
  'Free tier',
  'Premium tier',
  'Change user tier',
  'Toggle premium',
  'Toggle tier',
  'Tier updated',
  'Could not update tier',
  // French
  'Passer en premium',
  'Repasser en gratuit',
  'Forfait gratuit',
  'Forfait premium',
  'Changer le forfait',
  'Forfait mis à jour',
  'Impossible de changer le forfait',
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
  expect(existsSync(file), `${file} must exist (R1 T2)`).toBe(true);
  return readFileSync(file, 'utf8');
}

describe('TierToggleButton.tsx has no hard-coded UX strings (R1 R34 / AC18)', () => {
  it('TierToggleButton.tsx exists', () => {
    expect(existsSync(COMPONENT)).toBe(true);
  });

  it.each(FORBIDDEN)('does not contain forbidden literal in source string/JSX: %s', (literal) => {
    const src = readTsx(COMPONENT);
    expect(sourceContainsForbidden(src, literal)).toBe(false);
  });
});
