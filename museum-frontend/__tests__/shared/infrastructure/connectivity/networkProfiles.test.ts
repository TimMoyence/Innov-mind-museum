import { NETWORK_PROFILES } from '@/shared/infrastructure/connectivity/networkProfiles';

import type {
  NetworkProfile,
  NetworkProfileName,
} from '@/shared/infrastructure/connectivity/networkProfiles';

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

  it('declares expectedQuality null only for offline, ok/slow for every online profile', () => {
    expect(NETWORK_PROFILES.offline.expectedQuality).toBeNull();
    for (const name of ALL_NAMES) {
      if (name === 'offline') continue;
      expect(['ok', 'slow']).toContain(NETWORK_PROFILES[name].expectedQuality);
    }
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
});
