/**
 * TD-RNAV-01 — `.well-known` domain-association files + AASA Content-Type rule.
 *
 * Verifies the server-side half of Universal Links (iOS) + App Links (Android):
 *   - `public/.well-known/apple-app-site-association` (extensionless) is valid
 *     JSON, declares the verified appID, scopes to the 6 real magic-link routes
 *     (FR/EN x verify-email/reset-password/confirm-email-change) with a `?token`
 *     query matcher and NO blind `*` (spec R5/R6).
 *   - `public/.well-known/assetlinks.json` is a valid JSON array declaring the
 *     `handle_all_urls` delegation for the verified Android package + Google Play
 *     App Signing SHA256 fingerprint (spec R7/R8).
 *   - Neither file contains an unsubstituted placeholder token (spec R9, mirrors
 *     the PGP-key placeholder deploy gate).
 *   - `next.config.ts` source text carries a `headers()` rule forcing
 *     `Content-Type: application/json` on the extensionless AASA path
 *     (spec R5/R10/NFR-1, source-text per design D4).
 *
 * Verified literals (appID, package, fingerprint) come verbatim from
 * `prereqs-verified.json` (UFR-013, no fabrication). Runner: Vitest; reads
 * public files from disk via `node:fs` resolved against `process.cwd()`
 * (= museum-web when `pnpm test` runs there).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_ID = 'RB3F9L6GUD.com.musaium.mobile';
const ANDROID_PACKAGE = 'com.musaium.mobile';
const SHA256_FINGERPRINT =
  '38:97:AA:FF:19:54:2A:72:52:5F:40:71:1D:5A:64:13:44:71:D3:47:61:ED:B8:98:17:4F:7A:85:10:28:CA:34';

const EXPECTED_AASA_PATHS = [
  '/fr/verify-email',
  '/en/verify-email',
  '/fr/reset-password',
  '/en/reset-password',
  '/fr/confirm-email-change',
  '/en/confirm-email-change',
];

const readPublic = (relativePath: string): string =>
  readFileSync(join(process.cwd(), 'public', relativePath), 'utf8');

const readSource = (relativePath: string): string =>
  readFileSync(join(process.cwd(), relativePath), 'utf8');

interface AasaComponent {
  '/'?: string;
  '?'?: Record<string, string>;
}

interface AasaDetail {
  appIDs?: string[];
  components?: AasaComponent[];
}

interface Aasa {
  applinks?: {
    details?: AasaDetail[];
  };
}

interface AssetlinkStatement {
  relation?: string[];
  target?: {
    namespace?: string;
    package_name?: string;
    sha256_cert_fingerprints?: string[];
  };
}

// Lazy readers: parse inside each test so an absent file fails that single
// assertion (RED proof per requirement) rather than crashing collection.
const loadAasa = (): Aasa =>
  JSON.parse(readPublic('.well-known/apple-app-site-association')) as Aasa;
const loadAssetlinks = (): AssetlinkStatement[] =>
  JSON.parse(readPublic('.well-known/assetlinks.json')) as AssetlinkStatement[];

describe('apple-app-site-association (AASA)', () => {
  it('is valid JSON (R5)', () => {
    const aasa = loadAasa();
    expect(aasa).toBeTypeOf('object');
    expect(aasa.applinks?.details).toBeDefined();
    expect(Array.isArray(aasa.applinks?.details)).toBe(true);
  });

  it('declares exactly the verified appID (R6)', () => {
    const detail = loadAasa().applinks?.details?.[0];
    expect(detail?.appIDs).toEqual([APP_ID]);
  });

  it('scopes to the 6 magic-link routes with no blind wildcard (R6)', () => {
    const components = loadAasa().applinks?.details?.[0]?.components ?? [];
    const paths = components.map((component) => component['/']);

    for (const expectedPath of EXPECTED_AASA_PATHS) {
      expect(paths).toContain(expectedPath);
    }
    expect(paths).not.toContain('*');
    expect(paths.length).toBe(EXPECTED_AASA_PATHS.length);
  });

  it('requires a token query matcher on every component (R6)', () => {
    const components = loadAasa().applinks?.details?.[0]?.components ?? [];
    expect(components.length).toBe(EXPECTED_AASA_PATHS.length);

    for (const component of components) {
      expect(component['?']?.token).toBe('?*');
    }
  });
});

describe('assetlinks.json (Android Digital Asset Links)', () => {
  it('is a valid JSON array (R7)', () => {
    const assetlinks = loadAssetlinks();
    expect(Array.isArray(assetlinks)).toBe(true);
    expect(assetlinks.length).toBeGreaterThan(0);
  });

  it('delegates handle_all_urls to the verified package + fingerprint (R8)', () => {
    const statement = loadAssetlinks()[0];
    expect(statement).toBeDefined();
    expect(statement?.relation).toContain('delegate_permission/common.handle_all_urls');
    expect(statement?.target?.namespace).toBe('android_app');
    expect(statement?.target?.package_name).toBe(ANDROID_PACKAGE);
    expect(statement?.target?.sha256_cert_fingerprints).toContain(SHA256_FINGERPRINT);
  });
});

describe('placeholder-free deploy gate (R9)', () => {
  const files = ['.well-known/apple-app-site-association', '.well-known/assetlinks.json'];

  for (const file of files) {
    it(`${file} contains no unsubstituted placeholder token`, () => {
      const raw = readPublic(file);
      expect(raw).not.toMatch(/\$\{?[A-Z_]+\}?/);
      expect(raw).not.toMatch(/PLACEHOLDER/i);
      expect(raw).not.toMatch(/""\s*[,\]}]/);
    });
  }
});

describe('next.config.ts AASA Content-Type rule (R5/R10)', () => {
  const source = readSource('next.config.ts');

  it('declares a headers() rule for the extensionless AASA path', () => {
    expect(source).toMatch(/\/\.well-known\/apple-app-site-association/);
  });

  it('sets Content-Type application/json for the AASA path', () => {
    const aasaIndex = source.indexOf('/.well-known/apple-app-site-association');
    expect(aasaIndex).toBeGreaterThanOrEqual(0);

    const scoped = source.slice(aasaIndex, aasaIndex + 400);
    expect(scoped).toMatch(/Content-Type/);
    expect(scoped).toMatch(/application\/json/);
  });
});
