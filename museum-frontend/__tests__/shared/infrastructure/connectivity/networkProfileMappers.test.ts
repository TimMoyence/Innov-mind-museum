/**
 * B-R3 (RED) — the three pure mappers, re-ratified at 10 profiles + un-forced
 * L1 shape (run `undefined-network-detection-reliability`, spec §10 #5).
 *
 * Contract evolution (documented, NOT a frozen-test breach):
 *   - `FetchMockShape.forcedDataModePreference` is REMOVED (US-11.6 / design
 *     P-08 — dead-code burial UFR-016): the old mapper forced the preference
 *     for EVERY profile, so the L1 harness never exercised the real `auto`
 *     resolution (the doc said "un-forced", the code forced). No consumer
 *     exists outside the registry + this test (verified P-08).
 *   - the 4 new profiles (`4g` / `5g` / `wifi-metered` / `cellular-degraded`)
 *     flow through all three mappers; kbps→KB/s stays in EXACTLY ONE place
 *     (toToxics, EARS R4).
 *
 * lib-docs: none (pure mappers). toNetInfoSnapshot reused from the registry.
 * No inline test entities — profiles sourced from the registry.
 */
import {
  NETWORK_PROFILES,
  toFetchMockShape,
  toMiddlewareDescriptor,
  toToxics,
  toNetInfoSnapshot,
} from '@/shared/infrastructure/connectivity/networkProfiles';

import type { ToxiproxyToxic } from '@/shared/infrastructure/connectivity/networkProfiles';

const edge = NETWORK_PROFILES.edge;
const twoG = NETWORK_PROFILES['2g'];
const normal = NETWORK_PROFILES.normal;
const offline = NETWORK_PROFILES.offline;
const fourG = NETWORK_PROFILES['4g'];
const fiveG = NETWORK_PROFILES['5g'];
const wifiMetered = NETWORK_PROFILES['wifi-metered'];
const cellularDegraded = NETWORK_PROFILES['cellular-degraded'];

const allProfiles = Object.values(NETWORK_PROFILES);

const rateOf = (t: ToxiproxyToxic | undefined): number | undefined =>
  (t?.attributes as { rate?: number } | undefined)?.rate;

const bandwidthToxic = (
  toxics: ToxiproxyToxic[],
  stream: 'upstream' | 'downstream',
): ToxiproxyToxic | undefined => toxics.find((t) => t.type === 'bandwidth' && t.stream === stream);

describe('toFetchMockShape (B-R3 — un-forced L1 shape, US-11.6)', () => {
  it('maps edge to the L1 Jest shape with latency/loss/netinfo passthrough', () => {
    const shape = toFetchMockShape(edge);

    expect(shape.preResponseDelayMs).toBe(edge.latencyMs);
    expect(shape.failProbability).toBeCloseTo(edge.lossPct, 10);
    expect(shape.netinfo).toEqual(toNetInfoSnapshot(edge));
  });

  it('derives msPerKbit from bandwidth (1000 / kbps) for both directions', () => {
    const shape = toFetchMockShape(edge);

    expect(shape.msPerKbitDown).toBeCloseTo(1000 / edge.bwDownKbps, 6);
    expect(shape.msPerKbitUp).toBeCloseTo(1000 / edge.bwUpKbps, 6);
  });

  // US-11.6 / P-08 — the field is REMOVED, not just un-forced: the L1 harness
  // must exercise the REAL auto resolution for every profile.
  it.each(allProfiles.map((p) => [p.name, p] as const))(
    'no longer emits forcedDataModePreference for "%s" (US-11.6 — L1 exercises real auto resolution)',
    (_name, profile) => {
      const shape = toFetchMockShape(profile);
      expect(shape).not.toHaveProperty('forcedDataModePreference');
    },
  );

  it('passes the metered-derived netinfo through for the new profiles (US-11.3)', () => {
    expect(toFetchMockShape(fourG).netinfo).toEqual(toNetInfoSnapshot(fourG));
    expect(toFetchMockShape(fourG).netinfo.details?.isConnectionExpensive).toBe(true);
    expect(toFetchMockShape(wifiMetered).netinfo.details?.isConnectionExpensive).toBe(true);
    expect(toFetchMockShape(normal).netinfo.details?.isConnectionExpensive).toBe(false);
  });

  it('emits no raw KB/s field (conversion belongs to toToxics only)', () => {
    const shape = toFetchMockShape(edge) as Record<string, unknown>;
    expect(shape).not.toHaveProperty('rateKBs');
    expect(shape).not.toHaveProperty('rateKbytesPerSec');
  });
});

describe('toMiddlewareDescriptor (B-R3 — L2 values incl. the 4 new profiles)', () => {
  it('maps 2g to the L2 descriptor with delay/jitter/loss/ingress', () => {
    const d = toMiddlewareDescriptor(twoG);

    expect(d.delayMs).toBe(twoG.latencyMs);
    expect(d.jitterMs).toBe(twoG.jitterMs);
    expect(d.failProbability).toBeCloseTo(twoG.lossPct, 10);
    expect(d.ingressKbps).toBe(twoG.bwUpKbps);
  });

  it.each([
    ['4g', fourG],
    ['5g', fiveG],
    ['wifi-metered', wifiMetered],
    ['cellular-degraded', cellularDegraded],
  ] as const)('maps new profile "%s" straight from its canonical numbers', (_name, profile) => {
    const d = toMiddlewareDescriptor(profile);

    expect(d.delayMs).toBe(profile.latencyMs);
    expect(d.jitterMs).toBe(profile.jitterMs);
    expect(d.failProbability).toBeCloseTo(profile.lossPct, 10);
    expect(d.ingressKbps).toBe(profile.bwUpKbps);
    expect(d.sseChunkDelayMs).toBeGreaterThanOrEqual(0);
  });

  it('derives a positive sseChunkDelayMs that is larger for slower bandwidth', () => {
    const slow = toMiddlewareDescriptor(twoG);
    const fast = toMiddlewareDescriptor(normal);
    const degraded = toMiddlewareDescriptor(cellularDegraded);

    expect(slow.sseChunkDelayMs).toBeGreaterThan(0);
    expect(slow.sseChunkDelayMs).toBeGreaterThan(fast.sseChunkDelayMs);
    // cellular-degraded (75 kbps down) is even slower than 2g (100 kbps down).
    expect(degraded.sseChunkDelayMs).toBeGreaterThan(slow.sseChunkDelayMs);
  });

  it('emits no raw KB/s field (conversion belongs to toToxics only)', () => {
    const d = toMiddlewareDescriptor(twoG) as Record<string, unknown>;
    expect(d).not.toHaveProperty('rateKBs');
    expect(d).not.toHaveProperty('rateKbytesPerSec');
  });
});

describe('toToxics (B-R3 — the single kbps→KB/s site, both streams, 10 profiles)', () => {
  it('shapes BOTH streams for edge: upstream round(90/8)=11 KB/s, downstream 200/8=25 KB/s (Toxiproxy int64)', () => {
    const toxics = toToxics(edge);

    const up = bandwidthToxic(toxics, 'upstream');
    const down = bandwidthToxic(toxics, 'downstream');
    expect(up).toBeDefined();
    expect(down).toBeDefined();

    // kbps → KB/s is performed ONCE per direction, here only, rounded to a whole
    // KB/s because Toxiproxy's `rate` is a Go int64 (a fractional 11.25 → HTTP 400).
    expect(rateOf(up)).toBe(Math.round(edge.bwUpKbps / 8));
    expect(rateOf(up)).toBe(11);
    expect(rateOf(down)).toBe(Math.round(edge.bwDownKbps / 8));
    expect(rateOf(down)).toBe(25);
    // Every emitted rate MUST be an integer or Toxiproxy rejects the toxic (regression guard).
    expect(Number.isInteger(rateOf(up))).toBe(true);
    expect(Number.isInteger(rateOf(down))).toBe(true);

    // Exactly the two bandwidth streams (no extras, none dropped).
    const bandwidthStreams = toxics
      .filter((t: ToxiproxyToxic) => t.type === 'bandwidth')
      .map((t: ToxiproxyToxic) => t.stream)
      .sort();
    expect(bandwidthStreams).toEqual(['downstream', 'upstream']);
  });

  it.each([
    ['4g', fourG, 700 / 8, 1600 / 8],
    ['5g', fiveG, 5000 / 8, 10000 / 8],
    ['wifi-metered', wifiMetered, 2000 / 8, 5000 / 8],
    ['cellular-degraded', cellularDegraded, 30 / 8, 75 / 8],
  ] as const)(
    'shapes new profile "%s" with round(kbps/8) integer rates on both streams',
    (_name, profile, expectedUpKBs, expectedDownKBs) => {
      const toxics = toToxics(profile);

      // Toxiproxy `rate` is a Go int64 → the mapper rounds kbps/8 to a whole KB/s.
      expect(rateOf(bandwidthToxic(toxics, 'upstream'))).toBe(Math.round(expectedUpKBs));
      expect(rateOf(bandwidthToxic(toxics, 'downstream'))).toBe(Math.round(expectedDownKBs));
      expect(Number.isInteger(rateOf(bandwidthToxic(toxics, 'upstream')))).toBe(true);
      expect(Number.isInteger(rateOf(bandwidthToxic(toxics, 'downstream')))).toBe(true);
    },
  );

  it('carries the symmetric latency toxic with the profile latency/jitter (cellular-degraded 1800/600)', () => {
    const latency = toToxics(cellularDegraded).find((t) => t.type === 'latency');

    expect(latency).toBeDefined();
    expect(latency?.attributes).toEqual({
      latency: cellularDegraded.latencyMs,
      jitter: cellularDegraded.jitterMs,
    });
  });

  it('emits blocking/timeout toxics on BOTH streams for offline (bandwidth 0)', () => {
    const toxics = toToxics(offline);

    expect(toxics.length).toBeGreaterThan(0);
    const isBlocking = (t: ToxiproxyToxic): boolean =>
      t.type === 'timeout' || (t.type === 'bandwidth' && rateOf(t) === 0);

    const blockingUp = toxics.some((t: ToxiproxyToxic) => t.stream === 'upstream' && isBlocking(t));
    const blockingDown = toxics.some(
      (t: ToxiproxyToxic) => t.stream === 'downstream' && isBlocking(t),
    );
    expect(blockingUp).toBe(true);
    expect(blockingDown).toBe(true);
  });
});
