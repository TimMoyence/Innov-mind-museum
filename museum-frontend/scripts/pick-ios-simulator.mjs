#!/usr/bin/env node
/**
 * Resolve a bootable iOS simulator (runtime + device type) on THIS machine.
 *
 * Prints two lines to stdout:
 *   <runtime identifier>
 *   <device-type identifier>
 *
 * Why this exists: the iOS Maestro job used to hard-code
 *   xcrun simctl create maestro-sim "iPhone 15" "iOS17.5" || true
 * The GitHub `macos-26` runner ships ONLY iOS 26.x simulator runtimes (macos-15
 * shipped 18.x) — so `create` failed with "runtime not found", the `|| true`
 * swallowed it, `boot` failed the same way, and the job finally died on
 * `simctl install booted` → "No devices are booted", an error that points at
 * nothing. Runner images roll their Xcode/runtime versions regularly, so ANY
 * hard-coded pair is a time bomb.
 *
 * Two rules make the pick safe:
 *   1. take the NEWEST available iOS runtime;
 *   2. take the device type from that runtime's OWN `supportedDeviceTypes` list —
 *      compatibility is then guaranteed by construction. (Filtering the global
 *      `devicetypes` list by `productFamily === 'iPhone'` is NOT enough: it also
 *      returns the iPod touch, which no modern iOS runtime supports, and
 *      `simctl create` rejects it with "Incompatible device".)
 *
 * Exits non-zero with a readable message when nothing usable is found — never
 * silently.
 */
import { execFileSync } from 'node:child_process';

/** @returns {unknown} parsed `xcrun simctl list <what> --json` */
const simctlList = (what) =>
  JSON.parse(execFileSync('xcrun', ['simctl', 'list', what, '--json'], { encoding: 'utf8' }));

const runtimes = (simctlList('runtimes').runtimes ?? []).filter(
  (r) => r.isAvailable && r.identifier.startsWith('com.apple.CoreSimulator.SimRuntime.iOS'),
);

if (runtimes.length === 0) {
  console.error(
    '[pick-ios-simulator] no available iOS simulator runtime on this machine. ' +
      '`xcrun simctl list runtimes` shows none — the Xcode install is incomplete.',
  );
  process.exit(1);
}

const byVersion = (r) => r.version.split('.').map((p) => Number.parseInt(p, 10));
const newestRuntime = [...runtimes].sort((a, b) => {
  const [av, bv] = [byVersion(a), byVersion(b)];
  for (let i = 0; i < Math.max(av.length, bv.length); i += 1) {
    const diff = (av[i] ?? 0) - (bv[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}).at(-1);

const candidates = (newestRuntime.supportedDeviceTypes ?? []).filter(
  (d) => d.productFamily === 'iPhone' && d.identifier.includes('iPhone'),
);

if (candidates.length === 0) {
  console.error(
    `[pick-ios-simulator] runtime ${newestRuntime.identifier} supports no iPhone device type.`,
  );
  process.exit(1);
}

// Newest generation, preferring the STANDARD model (not Pro/Max/mini/Plus/SE) so
// the e2e runs on a representative screen size rather than an outlier.
const rank = (d) => {
  const gen = Number.parseInt(/iPhone\s+(\d+)/.exec(d.name)?.[1] ?? '0', 10);
  const isVariant = /(Pro|Max|mini|Plus|SE)/.test(d.name);
  return gen * 2 + (isVariant ? 0 : 1);
};
const device = [...candidates].sort((a, b) => rank(a) - rank(b)).at(-1);

process.stdout.write(`${newestRuntime.identifier}\n${device.identifier}\n`);
console.error(`[pick-ios-simulator] ${device.name} on ${newestRuntime.name}`);
