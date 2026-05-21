/**
 * B15 + B16 — Vendors checklist + HTML age correction (RED phase, UFR-022).
 *
 * Each of the 3 public privacy surfaces (HTML, museum-web, museum-frontend)
 * MUST disclose the 19 subprocessors enumerated in `team-state/2026-05-21-
 * p0-gdpr/spec.md` §3 R11. The HTML Article 10 minor-age string MUST read
 * "15 ans" (not 16) and cite CNIL Délibération 2021-018 (R13).
 *
 * Pre-impl state (RED): each surface lacks ≥13 vendors and HTML Article 10
 * still reads "16 ans". These assertions MUST fail with non-zero exit until
 * the GREEN phase regenerates the surfaces from the canonical source (T2.10).
 *
 * No applicative code touched here — only file reads + greps.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  CANONICAL_VENDORS,
  surfaceMentionsVendor,
  type PublicSurface,
} from '../../helpers/legal/vendors.fixtures';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const HTML_PATH = path.join(REPO_ROOT, 'docs/privacy-policy.html');
const WEB_PRIVACY_PATH = path.join(REPO_ROOT, 'museum-web/src/lib/privacy-content.ts');
const FE_PRIVACY_PATH = path.join(
  REPO_ROOT,
  'museum-frontend/features/legal/privacyPolicyContent.ts',
);

// ---------------------------------------------------------------------------
// Per-surface fixture loaders. Each returns the raw source text the test
// greps against. Surfaces are read from disk, not mocked — RED catches the
// real-world drift state.
// ---------------------------------------------------------------------------
function readSurface(surface: PublicSurface): string {
  if (surface === 'HTML') return readFileSync(HTML_PATH, 'utf8');
  if (surface === 'museum-web') return readFileSync(WEB_PRIVACY_PATH, 'utf8');
  return readFileSync(FE_PRIVACY_PATH, 'utf8');
}

describe('B15 — vendor disclosure on 3 public surfaces (R11)', () => {
  const surfaces: PublicSurface[] = ['HTML', 'museum-web', 'museum-frontend'];

  for (const surface of surfaces) {
    describe(`surface: ${surface}`, () => {
      const surfaceText = readSurface(surface);

      // One test per vendor × surface = 19 × 3 = 57 assertions in RED.
      // Granular reporting makes the GREEN drift diagnosis trivial.
      for (const vendor of CANONICAL_VENDORS) {
        it(`mentions vendor "${vendor.name}" (${vendor.category})`, () => {
          expect(surfaceMentionsVendor(surfaceText, vendor)).toBe(true);
        });
      }
    });
  }
});

describe('B15 — public /subprocessors route exists on museum-web', () => {
  it('exposes museum-web/src/app/[locale]/subprocessors/page.tsx', () => {
    const pagePath = path.join(REPO_ROOT, 'museum-web/src/app/[locale]/subprocessors/page.tsx');
    // RED: page does not exist. require.resolve / fs.statSync throws ENOENT.
    expect(() => readFileSync(pagePath, 'utf8')).not.toThrow();
  });
});

describe('B16 — HTML age correction (R13)', () => {
  const html = readFileSync(HTML_PATH, 'utf8');
  const lines = html.split('\n');

  it('Article 10 line 926 says "15 ans" (not 16)', () => {
    // `lines` is 0-indexed → file line 926 = lines[925].
    const line926 = lines[925] ?? '';
    expect(line926).toMatch(/15(\s|&nbsp;)*ans/);
    expect(line926).not.toMatch(/16(\s|&nbsp;)*ans/);
  });

  it('Article 10 line 928 says "15 ans" (not 16)', () => {
    const line928 = lines[927] ?? '';
    expect(line928).toMatch(/15(\s|&nbsp;)*ans/);
    expect(line928).not.toMatch(/16(\s|&nbsp;)*ans/);
  });

  it('Article 1 fact panel line 518 already says "15 ans" (existing, regression guard)', () => {
    const line518 = lines[517] ?? '';
    expect(line518).toMatch(/15(\s|&nbsp;)*ans/);
  });

  it('Article 10 cites CNIL Délibération 2021-018', () => {
    // The legal citation must appear somewhere in the HTML (R13).
    expect(html).toMatch(/D[ée]lib[ée]ration\s*2021-018/);
  });

  it('no surviving "16 ans" anywhere in the policy', () => {
    // After GREEN regen, every minor-age reference must be 15.
    const remaining16 = lines
      .map((line, idx) => ({ line, idx: idx + 1 }))
      .filter(({ line }) => /16(\s|&nbsp;)*ans/.test(line));
    expect(remaining16).toEqual([]);
  });
});

describe('B16 — canonical source exists (R14)', () => {
  it('museum-backend/src/shared/legal/privacy-content.canonical.json exists', () => {
    const canonical = path.join(
      REPO_ROOT,
      'museum-backend/src/shared/legal/privacy-content.canonical.json',
    );
    expect(() => readFileSync(canonical, 'utf8')).not.toThrow();
  });

  it('museum-backend/src/shared/legal/terms-content.canonical.json exists', () => {
    const terms = path.join(
      REPO_ROOT,
      'museum-backend/src/shared/legal/terms-content.canonical.json',
    );
    expect(() => readFileSync(terms, 'utf8')).not.toThrow();
  });
});
