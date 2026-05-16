/**
 * R3 RED — landing page mount sentinel.
 *
 * Pins R3 §1 R1 + AC1 down BEFORE implementation: the landing page MUST
 * inject `<BetaSignupSection>` AFTER `<LandingDownloadCTA>` and BEFORE the
 * `<Footer>` (which is rendered by the layout, not the page).
 *
 * Approach: grep the page.tsx source for the import + the JSX position.
 * Source-grep is more robust than rendering the full landing tree (which
 * pulls Framer Motion + marketing fixtures).
 *
 * MUST FAIL at baseline `d5919dd3` — page.tsx does not import
 * BetaSignupSection yet.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PAGE = resolve(__dirname, '..', 'page.tsx');

function readPage(): string {
  expect(existsSync(PAGE), `${PAGE} must exist`).toBe(true);
  return readFileSync(PAGE, 'utf8');
}

describe('Landing page mounts <BetaSignupSection> (R3 R1 / AC1)', () => {
  it('imports BetaSignupSection from the [locale] route', () => {
    const src = readPage();
    expect(src).toMatch(/import\s+BetaSignupSection\s+from\s+['"][^'"]*BetaSignupSection['"]/);
  });

  it('renders <BetaSignupSection> in JSX', () => {
    const src = readPage();
    expect(src).toMatch(/<BetaSignupSection\b/);
  });

  it('mounts <BetaSignupSection> AFTER <LandingDownloadCTA> (D1 placement)', () => {
    const src = readPage();
    const downloadIdx = src.indexOf('<LandingDownloadCTA');
    const betaIdx = src.indexOf('<BetaSignupSection');
    expect(downloadIdx).toBeGreaterThanOrEqual(0);
    expect(betaIdx).toBeGreaterThan(downloadIdx);
  });
});
