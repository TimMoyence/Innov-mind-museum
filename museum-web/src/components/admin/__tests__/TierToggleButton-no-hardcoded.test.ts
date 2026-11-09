import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const COMPONENT = resolve(__dirname, '..', 'TierToggleButton.tsx');

const FORBIDDEN = [
  'Promote to premium',
  'Demote to free',
  'Free tier',
  'Premium tier',
  'Change user tier',
  'Toggle premium',
  'Toggle tier',
  'Tier updated',
  'Could not update tier',
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
