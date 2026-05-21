#!/usr/bin/env node
/**
 * Sentinel: ios-plist-location-keys
 *
 * Guards `museum-frontend/ios/Musaium/Info.plist` against re-introduction of
 * `NSLocationAlways*UsageDescription` keys. Musaium V1 ships foreground-only
 * location ("When In Use"); the Always variants are a hard App Store
 * 5.1.1(i) regression hazard (we'd be declaring background-location usage
 * without actually implementing it, and over-collecting under GDPR).
 *
 * Spec: R19 + R20 (team-state/2026-05-21-p0-gdpr/spec.md §3.3).
 *
 * Contract:
 *   - Reads the plist whose path is given by `INFO_PLIST_LOCATION_KEYS_TARGET`
 *     (absolute), or falls back to `<repoRoot>/ios/Musaium/Info.plist`
 *     resolved relative to this script's location.
 *   - Exit 0 if the plist contains exactly one `NSLocationWhenInUseUsageDescription`
 *     and ZERO `NSLocationAlways[A-Za-z]*UsageDescription` keys.
 *   - Exit 1 if any `NSLocationAlways*UsageDescription` key is present;
 *     stderr names which forbidden key(s) were found and on which line(s).
 *   - Exit 1 if `NSLocationWhenInUseUsageDescription` is missing entirely
 *     (we never want to lose the legitimate permission descriptor).
 *
 * No deps — pure Node, runs in CI without an install step.
 *
 * CLAUDE.md note: this plist is edited manually (iOS = Xcode Cloud, Pods/
 * committed). Do not re-prebuild — it would lose the Podfile post_install
 * patches (fmt-consteval, ENTRY_FILE injection, MapLibre signature strip).
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FORBIDDEN_KEY_RE = /NSLocationAlways[A-Za-z]*UsageDescription/;
const REQUIRED_KEY = 'NSLocationWhenInUseUsageDescription';

function resolveTargetPath() {
  const fromEnv = process.env.INFO_PLIST_LOCATION_KEYS_TARGET;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  const here = dirname(fileURLToPath(import.meta.url));
  // scripts/sentinels/ → museum-frontend/ → ios/Musaium/Info.plist
  return resolve(here, '..', '..', 'ios', 'Musaium', 'Info.plist');
}

function main() {
  const target = resolveTargetPath();

  if (!existsSync(target)) {
    process.stderr.write(`[ios-plist-location-keys] target plist not found: ${target}\n`);
    process.exit(1);
  }

  const raw = readFileSync(target, 'utf-8');
  const lines = raw.split('\n');

  const forbidden = [];
  let hasWhenInUse = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FORBIDDEN_KEY_RE.test(line)) {
      const match = line.match(FORBIDDEN_KEY_RE);
      forbidden.push({ line: i + 1, key: match ? match[0] : 'NSLocationAlways*UsageDescription' });
    }
    if (line.includes(REQUIRED_KEY)) {
      hasWhenInUse = true;
    }
  }

  if (forbidden.length > 0) {
    process.stderr.write(
      `[ios-plist-location-keys] FAIL: forbidden NSLocationAlways*UsageDescription key(s) found in ${target}\n`,
    );
    for (const f of forbidden) {
      process.stderr.write(`  - ${f.key} at line ${f.line}\n`);
    }
    process.stderr.write(
      `Musaium V1 ships foreground-only location. App Store 5.1.1(i) hazard. See spec R19/R20.\n`,
    );
    process.exit(1);
  }

  if (!hasWhenInUse) {
    process.stderr.write(
      `[ios-plist-location-keys] FAIL: required key ${REQUIRED_KEY} missing in ${target}\n`,
    );
    process.exit(1);
  }

  process.stdout.write(
    `[ios-plist-location-keys] OK: ${target} has ${REQUIRED_KEY}, no Always* variants.\n`,
  );
  process.exit(0);
}

main();
