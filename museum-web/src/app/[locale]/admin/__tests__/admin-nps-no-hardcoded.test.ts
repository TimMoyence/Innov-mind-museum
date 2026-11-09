import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PAGE = resolve(__dirname, '..', 'nps', 'page.tsx');

const FORBIDDEN = [
  'Net Promoter Score',
  'How likely',
  'No data available',
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
