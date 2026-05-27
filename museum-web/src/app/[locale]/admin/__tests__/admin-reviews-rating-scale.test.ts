/**
 * T-WEB-4 (RED) — C2 / S-WEB — admin reviews page renders ratings out of /10.
 *
 * Pins R26 BEFORE implementation: the NPS scale is 0-10, so the reviews
 * moderation table + modal must render the rating denominator as `/10`, never
 * the legacy `/5` (`admin/reviews/page.tsx:169,:271`). A rating of 9 on the
 * 0-10 scale displayed as `9/5` is nonsensical (>100%).
 *
 * Source-level assertion (the rating denominator is a static template literal
 * in the JSX): the table cell and the modal both interpolate the raw rating
 * followed by a fixed `/N` suffix. We assert the source no longer contains the
 * `/5` suffix and does contain `/10`.
 *
 * MUST FAIL at baseline: both render sites currently emit `{...rating}/5`.
 */
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
    // Table cell: `{r.rating}/10`
    expect(src).toContain('{r.rating}/10');
    expect(src).not.toContain('{r.rating}/5');
  });

  it('renders the modal rating out of /10 (not /5)', () => {
    const src = readSource();
    // Confirm-modal preview: `{moderating.rating}/10`
    expect(src).toContain('{moderating.rating}/10');
    expect(src).not.toContain('{moderating.rating}/5');
  });

  it('contains no legacy `/5` rating suffix anywhere in the page', () => {
    const src = readSource();
    expect(/rating\}\/5\b/.test(src)).toBe(false);
  });
});
