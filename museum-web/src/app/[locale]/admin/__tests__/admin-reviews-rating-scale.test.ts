import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PAGE = resolve(__dirname, '..', 'reviews', 'page.tsx');

function readSource(): string {
  return readFileSync(PAGE, 'utf8');
}

describe('admin/reviews/page.tsx rating denominator (R26)', () => {
  it('renders the table rating out of /10 (not /5)', () => {
    const src = readSource();
    expect(src).toContain('{r.rating}/10');
    expect(src).not.toContain('{r.rating}/5');
  });

  it('renders the modal rating out of /10 (not /5)', () => {
    const src = readSource();
    expect(src).toContain('{moderating.rating}/10');
    expect(src).not.toContain('{moderating.rating}/5');
  });

  it('contains no legacy `/5` rating suffix anywhere in the page', () => {
    const src = readSource();
    expect(/rating\}\/5\b/.test(src)).toBe(false);
  });
});
