/**
 * W1-REG-01 (RED) — Network Profile Registry shape + frozen contract.
 *
 * Authoritative spec: docs/superpowers/specs/2026-06-01-weak-network-resilience-and-test-track-design.md
 *   §"The Profile Registry (the keystone)" — TS shape + ratified canonical numbers.
 * Cycle artefacts: .claude/skills/team/team-state/2026-06-01-weak-net-registry/{spec,design,tasks}.md
 *
 * This test proves the registry does NOT yet exist (import of
 * `@/shared/infrastructure/connectivity/networkProfiles` fails to resolve) and,
 * once green, pins:
 *   - exactly 6 keys: offline / 2g / edge / 3g-lossy / flapping / normal
 *   - the ratified canonical numbers (design.md §Canonical numbers)
 *   - Object.isFrozen at record AND per-profile level
 *   - ONLY flapping carries dutyCycle { onlineMs:5000, offlineMs:3000, baseProfile:'3g-lossy' }
 *   - the module imports neither `react` nor `@react-native-community/netinfo`
 *     (purity, asserted by reading the source file — EARS R6)
 *
 * lib-docs: @react-native-community/netinfo (PATTERNS.md §1 imports — the purity
 *   assertion below guards that the registry NEVER pulls this lib in).
 *
 * No inline test entities (docs/TEST_FACTORIES.md): the assertions read the
 * registry itself as the source of truth, not hand-rolled fixtures.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { NETWORK_PROFILES } from '@/shared/infrastructure/connectivity/networkProfiles';

import type {
  NetworkProfile,
  NetworkProfileName,
} from '@/shared/infrastructure/connectivity/networkProfiles';

// Repo-root relative path to the registry source (purity source-grep, EARS R6).
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

// Ratified canonical numbers (design.md §Canonical numbers — DO NOT inline-edit;
// these mirror the locked table and exist to detect silent drift).
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
  },
};

const ALL_NAMES: NetworkProfileName[] = ['offline', '2g', 'edge', '3g-lossy', 'flapping', 'normal'];

describe('NETWORK_PROFILES registry (W1-REG-01)', () => {
  it('exposes exactly the 6 ratified keys', () => {
    expect(Object.keys(NETWORK_PROFILES).sort()).toEqual([...ALL_NAMES].sort());
  });

  it.each(ALL_NAMES)('profile "%s" carries its ratified canonical numbers', (name) => {
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
    expect(typeof p.label).toBe('string');
    expect(p.label.length).toBeGreaterThan(0);
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
