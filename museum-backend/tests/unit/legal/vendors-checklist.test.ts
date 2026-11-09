import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  CANONICAL_VENDORS,
  surfaceMentionsVendor,
  type PublicSurface,
} from '../../helpers/legal/vendors.fixtures';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const WEB_PRIVACY_PATH = path.join(
  REPO_ROOT,
  'museum-web/src/lib/legal/privacy-content.canonical.json',
);
const FE_PRIVACY_PATH = path.join(
  REPO_ROOT,
  'museum-frontend/features/legal/privacyPolicyContent.ts',
);

function readSurface(surface: PublicSurface): string {
  if (surface === 'museum-web') return readFileSync(WEB_PRIVACY_PATH, 'utf8');
  return readFileSync(FE_PRIVACY_PATH, 'utf8');
}

describe('B15 — vendor disclosure on 3 public surfaces (R11)', () => {
  const surfaces: PublicSurface[] = ['museum-web', 'museum-frontend'];

  for (const surface of surfaces) {
    describe(`surface: ${surface}`, () => {
      const surfaceText = readSurface(surface);

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
    expect(() => readFileSync(pagePath, 'utf8')).not.toThrow();
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
