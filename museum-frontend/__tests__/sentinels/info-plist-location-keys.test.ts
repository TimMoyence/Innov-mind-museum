/**
 * RED — sentinel test for B10 (App Store 5.1.1(i) regression guard).
 *
 * Spec: R19 + R20 (team-state/2026-05-21-p0-gdpr/spec.md).
 * Tasks: T3.1 (RED), backed by T3.3 + T3.4 (GREEN).
 *
 * Contract:
 *   `museum-frontend/scripts/sentinels/info-plist-location-keys.mjs` (Node,
 *   no deps) reads an iOS `Info.plist` and FAILS (exit 1) if any line matches
 *   `/NSLocationAlways[A-Za-z]*UsageDescription/`. It passes (exit 0) when the
 *   plist contains only `NSLocationWhenInUseUsageDescription` (exactly 1).
 *
 * The sentinel resolves its target plist via the env var
 * `INFO_PLIST_LOCATION_KEYS_TARGET` (absolute path). When unset, it falls
 * back to `<repoRoot>/ios/Musaium/Info.plist` relative to its own location
 * (`scripts/sentinels/` → `..` → `..` → `ios/...`). This indirection lets
 * the negative test point at a fixture without mutating the committed plist.
 *
 * RED expectations (pre-impl, this manifest entry):
 *   - The sentinel script DOES NOT EXIST → execFileSync throws ENOENT
 *     (Node maps missing file to exit 1 with non-empty stderr).
 *   - Even if the script existed, the committed Info.plist still carries the
 *     two `NSLocationAlways*` blocks at :68-71 (verified V3), so the positive
 *     assertion (`exits 0 on real plist`) would also fail.
 *
 * GREEN turns both green:
 *   - T3.3 removes lines 68-71 from `ios/Musaium/Info.plist`.
 *   - T3.4 creates the sentinel script.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SENTINEL = join(
  __dirname,
  '..',
  '..',
  'scripts',
  'sentinels',
  'info-plist-location-keys.mjs',
);

const REAL_PLIST = join(__dirname, '..', '..', 'ios', 'Musaium', 'Info.plist');

interface SentinelResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runSentinel(plistPath: string): SentinelResult {
  try {
    const stdout = execFileSync('node', [SENTINEL], {
      env: { ...process.env, INFO_PLIST_LOCATION_KEYS_TARGET: plistPath },
      encoding: 'utf-8',
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      code: e.status ?? 1,
      stdout: typeof e.stdout === 'string' ? e.stdout : (e.stdout?.toString() ?? ''),
      stderr: typeof e.stderr === 'string' ? e.stderr : (e.stderr?.toString() ?? ''),
    };
  }
}

function writeFixturePlist(contents: string): { path: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'info-plist-sentinel-'));
  const path = join(root, 'Info.plist');
  writeFileSync(path, contents, 'utf-8');
  return {
    path,
    cleanup: () => {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

const PLIST_HEADER = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
`;
const PLIST_FOOTER = `</dict>
</plist>
`;

const WHEN_IN_USE_BLOCK = `	<key>NSLocationWhenInUseUsageDescription</key>
	<string>Musaium uses your location to find museums and cultural sites near you.</string>
`;

const ALWAYS_BLOCK = `	<key>NSLocationAlwaysUsageDescription</key>
	<string>Allow $(PRODUCT_NAME) to access your location</string>
`;

const ALWAYS_AND_WHEN_IN_USE_BLOCK = `	<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
	<string>Allow $(PRODUCT_NAME) to access your location</string>
`;

describe('sentinel: info-plist-location-keys', () => {
  describe('positive cases (exit 0)', () => {
    it('exits 0 on a synthetic plist containing only NSLocationWhenInUseUsageDescription', () => {
      const fixture = writeFixturePlist(PLIST_HEADER + WHEN_IN_USE_BLOCK + PLIST_FOOTER);
      try {
        const result = runSentinel(fixture.path);
        expect(result.code).toBe(0);
      } finally {
        fixture.cleanup();
      }
    });

    it('exits 0 on the committed museum-frontend/ios/Musaium/Info.plist (after B10 cleanup)', () => {
      // GREEN T3.3 removes the two Always* blocks (currently at :68-71). Until
      // then, this assertion fails because the real plist still has them.
      const result = runSentinel(REAL_PLIST);
      expect(result.code).toBe(0);
    });
  });

  describe('negative cases (exit 1)', () => {
    it('exits 1 and names NSLocationAlwaysUsageDescription when the plist re-introduces it', () => {
      const fixture = writeFixturePlist(
        PLIST_HEADER + WHEN_IN_USE_BLOCK + ALWAYS_BLOCK + PLIST_FOOTER,
      );
      try {
        const result = runSentinel(fixture.path);
        expect(result.code).toBe(1);
        const output = `${result.stdout}${result.stderr}`;
        expect(output).toMatch(/NSLocationAlwaysUsageDescription/);
      } finally {
        fixture.cleanup();
      }
    });

    it('exits 1 when the plist re-introduces NSLocationAlwaysAndWhenInUseUsageDescription', () => {
      const fixture = writeFixturePlist(
        PLIST_HEADER + WHEN_IN_USE_BLOCK + ALWAYS_AND_WHEN_IN_USE_BLOCK + PLIST_FOOTER,
      );
      try {
        const result = runSentinel(fixture.path);
        expect(result.code).toBe(1);
        const output = `${result.stdout}${result.stderr}`;
        expect(output).toMatch(/NSLocationAlwaysAndWhenInUseUsageDescription/);
      } finally {
        fixture.cleanup();
      }
    });
  });
});
