/**
 * B-R1 (RED) — Network Profile Registry shape + frozen contract, re-ratified
 * at 10 profiles (run `undefined-network-detection-reliability`, spec §10 #4).
 *
 * Contract evolution (documented, NOT a frozen-test breach): the W1 6-profile
 * ratification is superseded by spec US-11.1/US-11.2 — four new profiles
 * (`4g` / `5g` / `wifi-metered` / `cellular-degraded`) and two new data-region
 * fields per profile:
 *   - `metered: boolean`        (COST axis — source of `isConnectionExpensive`)
 *   - `expectedQuality: 'ok' | 'slow' | null` (ENGINE verdict, D-04 — explicit
 *     field, never derived inside a test; `null` = offline, no samples possible)
 *
 * Pins (design.md §2.7 canonical table):
 *   - exactly 10 keys
 *   - the ratified canonical numbers incl. metered + expectedQuality
 *   - Object.isFrozen at record AND per-profile level
 *   - ONLY flapping carries dutyCycle { onlineMs:5000, offlineMs:3000, baseProfile:'3g-lossy' }
 *   - data-region markers intact + new fields/profiles live INSIDE the region
 *     (INV-16 — the BE parity sentinel hashes only the bytes between markers)
 *   - the module imports neither `react` nor `@react-native-community/netinfo`
 *     (purity, EARS R6 — unchanged)
 *
 * lib-docs: @react-native-community/netinfo (PATTERNS.md §1 imports — purity
 *   grep below guards the registry never pulls the lib in).
 *
 * No inline test entities: the CANONICAL table mirrors the locked design table
 * (drift detector), assertions read the registry itself as source of truth.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { NETWORK_PROFILES } from '@/shared/infrastructure/connectivity/networkProfiles';

import type {
  NetworkProfile,
  NetworkProfileName,
} from '@/shared/infrastructure/connectivity/networkProfiles';

// Repo-root relative path to the registry source (purity + marker source-grep).
const REGISTRY_SOURCE = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'shared',
  'infrastructure',
  'connectivity',
  'networkProfiles.ts',
);

const REGION_START = '>>> NETWORK_PROFILES_DATA_REGION_START';
const REGION_END = '<<< NETWORK_PROFILES_DATA_REGION_END';

// Ratified canonical numbers (design.md §2.7 table — DO NOT inline-edit; these
// mirror the locked table and exist to detect silent drift).
const CANONICAL: Record<
  NetworkProfileName,
  Omit<NetworkProfile, 'name' | 'label' | 'dutyCycle'>
> = {
  offline: {
    latencyMs: 0,
    jitterMs: 0,
    bwDownKbps: 0,
    bwUpKbps: 0,
    lossPct: 1.0,
    netinfoType: 'none',
    cellularGeneration: null,
    expectedDataMode: 'low',
    metered: false,
    expectedQuality: null,
  },
  '2g': {
    latencyMs: 350,
    jitterMs: 150,
    bwDownKbps: 100,
    bwUpKbps: 40,
    lossPct: 0.02,
    netinfoType: 'cellular',
    cellularGeneration: '2g',
    expectedDataMode: 'low',
    metered: true,
    expectedQuality: 'ok',
  },
  edge: {
    latencyMs: 200,
    jitterMs: 120,
    bwDownKbps: 200,
    bwUpKbps: 90,
    lossPct: 0.01,
    netinfoType: 'cellular',
    cellularGeneration: '2g',
    expectedDataMode: 'low',
    metered: true,
    expectedQuality: 'ok',
  },
  '3g-lossy': {
    latencyMs: 120,
    jitterMs: 80,
    bwDownKbps: 700,
    bwUpKbps: 300,
    lossPct: 0.08,
    netinfoType: 'cellular',
    cellularGeneration: '3g',
    expectedDataMode: 'low',
    metered: true,
    expectedQuality: 'ok',
  },
  flapping: {
    latencyMs: 120,
    jitterMs: 80,
    bwDownKbps: 700,
    bwUpKbps: 300,
    lossPct: 0.08,
    netinfoType: 'cellular',
    cellularGeneration: '3g',
    expectedDataMode: 'low',
    metered: true,
    expectedQuality: 'ok',
  },
  normal: {
    latencyMs: 25,
    jitterMs: 10,
    bwDownKbps: 20000,
    bwUpKbps: 8000,
    lossPct: 0.0,
    netinfoType: 'wifi',
    cellularGeneration: null,
    expectedDataMode: 'normal',
    metered: false,
    expectedQuality: 'ok',
  },
  '4g': {
    latencyMs: 175,
    jitterMs: 50,
    bwDownKbps: 1600,
    bwUpKbps: 700,
    lossPct: 0.0,
    netinfoType: 'cellular',
    cellularGeneration: '4g',
    expectedDataMode: 'normal',
    metered: true,
    expectedQuality: 'ok',
  },
  '5g': {
    latencyMs: 60,
    jitterMs: 20,
    bwDownKbps: 10000,
    bwUpKbps: 5000,
    lossPct: 0.0,
    netinfoType: 'cellular',
    cellularGeneration: '5g',
    expectedDataMode: 'normal',
    metered: true,
    expectedQuality: 'ok',
  },
  'wifi-metered': {
    latencyMs: 80,
    jitterMs: 30,
    bwDownKbps: 5000,
    bwUpKbps: 2000,
    lossPct: 0.0,
    netinfoType: 'wifi',
    cellularGeneration: null,
    expectedDataMode: 'normal',
    metered: true,
    expectedQuality: 'ok',
  },
  'cellular-degraded': {
    latencyMs: 1800,
    jitterMs: 600,
    bwDownKbps: 75,
    bwUpKbps: 30,
    lossPct: 0.3,
    netinfoType: 'cellular',
    cellularGeneration: '4g',
    expectedDataMode: 'normal',
    metered: true,
    expectedQuality: 'slow',
  },
};

const ALL_NAMES: NetworkProfileName[] = [
  'offline',
  '2g',
  'edge',
  '3g-lossy',
  'flapping',
  'normal',
  '4g',
  '5g',
  'wifi-metered',
  'cellular-degraded',
];

describe('NETWORK_PROFILES registry — 10 profiles (B-R1, US-11.1/US-11.2)', () => {
  it('exposes exactly the 10 ratified keys (US-11.1)', () => {
    expect(Object.keys(NETWORK_PROFILES).sort()).toEqual([...ALL_NAMES].sort());
  });

  it.each(ALL_NAMES)(
    'profile "%s" carries its ratified canonical numbers incl. metered + expectedQuality (US-11.2)',
    (name) => {
      const p = NETWORK_PROFILES[name];
      const expected = CANONICAL[name];
      if (expected === undefined) {
        throw new Error(`no canonical row for profile "${name}"`);
      }

      expect(p.name).toBe(name);
      expect(p.latencyMs).toBe(expected.latencyMs);
      expect(p.jitterMs).toBe(expected.jitterMs);
      expect(p.bwDownKbps).toBe(expected.bwDownKbps);
      expect(p.bwUpKbps).toBe(expected.bwUpKbps);
      expect(p.lossPct).toBeCloseTo(expected.lossPct, 10);
      expect(p.netinfoType).toBe(expected.netinfoType);
      expect(p.cellularGeneration).toBe(expected.cellularGeneration);
      expect(p.expectedDataMode).toBe(expected.expectedDataMode);
      expect(p.metered).toBe(expected.metered);
      expect(p.expectedQuality).toBe(expected.expectedQuality);
      expect(typeof p.label).toBe('string');
      expect(p.label.length).toBeGreaterThan(0);
    },
  );

  // US-11.2 — COST axis: every cellular profile is metered; plain wifi control
  // + offline are not; wifi-metered is the Android hotspot/metered-wifi case.
  it('marks every cellular profile metered, offline + plain wifi not metered', () => {
    for (const name of ALL_NAMES) {
      const p = NETWORK_PROFILES[name];
      if (p.netinfoType === 'cellular') {
        expect(p.metered).toBe(true);
      }
    }
    expect(NETWORK_PROFILES.offline.metered).toBe(false);
    expect(NETWORK_PROFILES.normal.metered).toBe(false);
    expect(NETWORK_PROFILES['wifi-metered'].metered).toBe(true);
  });

  // D-04 — expectedQuality is null ONLY for offline (no samples possible).
  it('declares expectedQuality null only for offline, ok/slow for every online profile', () => {
    expect(NETWORK_PROFILES.offline.expectedQuality).toBeNull();
    for (const name of ALL_NAMES) {
      if (name === 'offline') continue;
      expect(['ok', 'slow']).toContain(NETWORK_PROFILES[name].expectedQuality);
    }
    // The "5G one-bar basement" case: label says normal, the ENGINE must say slow.
    expect(NETWORK_PROFILES['cellular-degraded'].expectedQuality).toBe('slow');
  });

  it('freezes the record at the top level', () => {
    expect(Object.isFrozen(NETWORK_PROFILES)).toBe(true);
  });

  it.each(ALL_NAMES)('freezes profile "%s"', (name) => {
    expect(Object.isFrozen(NETWORK_PROFILES[name])).toBe(true);
  });

  it('attaches dutyCycle ONLY to flapping with the ratified schedule', () => {
    expect(NETWORK_PROFILES.flapping.dutyCycle).toEqual({
      onlineMs: 5000,
      offlineMs: 3000,
      baseProfile: '3g-lossy',
    });

    for (const name of ALL_NAMES) {
      if (name === 'flapping') continue;
      expect(NETWORK_PROFILES[name].dutyCycle).toBeUndefined();
    }
  });

  // INV-16 — the parity sentinel + BE contract test hash ONLY the bytes between
  // the markers: they must stay intact and the new profiles/fields must live
  // INSIDE the hashed region (otherwise FE/BE could silently drift).
  describe('data-region markers (INV-16)', () => {
    const source = readFileSync(REGISTRY_SOURCE, 'utf8');

    it('keeps exactly one START and one END marker, in order', () => {
      expect(source.split(REGION_START)).toHaveLength(2);
      expect(source.split(REGION_END)).toHaveLength(2);
      expect(source.indexOf(REGION_START)).toBeLessThan(source.indexOf(REGION_END));
    });

    it('declares the 4 new profiles and the 2 new fields INSIDE the data region', () => {
      const region = source.slice(
        source.indexOf(REGION_START),
        source.indexOf(REGION_END) + REGION_END.length,
      );

      expect(region).toContain("'4g'");
      expect(region).toContain("'5g'");
      expect(region).toContain("'wifi-metered'");
      expect(region).toContain("'cellular-degraded'");

      // One `metered:` + one `expectedQuality:` field declaration per profile (×10).
      expect(region.match(/metered: (?:true|false)/g) ?? []).toHaveLength(10);
      expect(region.match(/expectedQuality: (?:'ok'|'slow'|null)/g) ?? []).toHaveLength(10);
    });
  });

  // EARS R6 — purity: the registry must import neither react nor netinfo.
  it('imports neither react nor @react-native-community/netinfo (source-grep)', () => {
    const source = readFileSync(REGISTRY_SOURCE, 'utf8');

    const importLines = source.split('\n').filter((line) => /^\s*import[\s{*]/.test(line));

    for (const line of importLines) {
      expect(line).not.toMatch(/from\s+['"]react['"]/);
      expect(line).not.toMatch(/from\s+['"]@react-native-community\/netinfo['"]/);
    }
  });
});
