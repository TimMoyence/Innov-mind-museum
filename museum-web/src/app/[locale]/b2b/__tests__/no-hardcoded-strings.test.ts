import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PAGE = resolve(__dirname, '..', 'page.tsx');
const FORM = resolve(__dirname, '..', 'B2bContactForm.tsx');

const FORBIDDEN = [
  'Sur devis',
  'Custom pricing',
  'Director',
  'Conservateur',
  'Voice-first',
  'Voice first',
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
    expect(src).not.toMatch(new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  });

  it.each(FORBIDDEN)('B2bContactForm.tsx does not contain forbidden literal: %s', (literal) => {
    const src = readTsx(FORM);
    expect(src).not.toMatch(new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  });
});
