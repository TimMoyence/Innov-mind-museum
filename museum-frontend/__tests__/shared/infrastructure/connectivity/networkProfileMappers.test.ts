/**
 * W1-REG-07 (RED) — the three pure mappers.
 *
 * Spec: master spec §"Three mappers" + tasks.md W1-REG-07. Each mapper translates
 * a frozen profile into one layer's knobs; the kbps→KB/s conversion lives in
 * EXACTLY ONE place (toToxics) — DRY (EARS R4).
 *
 *   toFetchMockShape(edge) → {
 *     preResponseDelayMs: 200,           // = edge.latencyMs
 *     failProbability: 0.01,             // = edge.lossPct
 *     msPerKbitDown/Up: derived from 200/90 kbps (= 1000 / kbps),
 *     netinfo: toNetInfoSnapshot(edge),
 *     forcedDataModePreference: 'low',   // edge.expectedDataMode
 *   }
 *   toFetchMockShape(normal).forcedDataModePreference → undefined | 'normal' (NOT 'low').
 *
 *   toMiddlewareDescriptor(2g) → {
 *     delayMs: 350, jitterMs: 150, failProbability: 0.02,
 *     sseChunkDelayMs: derived (slower profile → larger), ingressKbps: 40 (= bwUpKbps),
 *   }
 *
 *   toToxics(edge) → ToxiproxyToxic[] shaping BOTH streams (spec §NFR "both streams
 *     sole shaper"): an UPSTREAM bandwidth toxic rate = bwUpKbps/8 = 11.25 KB/s AND a
 *     DOWNSTREAM bandwidth toxic rate = bwDownKbps/8 = 25 KB/s, each carrying its own
 *     `stream` field. kbps→KB/s lives in EXACTLY ONE place (toToxics) — the OTHER two
 *     mappers emit NO KB/s field.
 *   toToxics(offline) → blocking (bandwidth 0 / timeout) toxics on BOTH streams.
 *
 * lib-docs: none (pure mappers). toNetInfoSnapshot reused from W1-REG-04.
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

describe('toFetchMockShape (W1-REG-07a)', () => {
  it('maps edge to the L1 Jest shape with latency/loss/forced-low', () => {
    const shape = toFetchMockShape(edge);

    expect(shape.preResponseDelayMs).toBe(edge.latencyMs);
    expect(shape.failProbability).toBeCloseTo(edge.lossPct, 10);
    expect(shape.forcedDataModePreference).toBe('low');
    expect(shape.netinfo).toEqual(toNetInfoSnapshot(edge));
  });

  it('derives msPerKbit from bandwidth (1000 / kbps) for both directions', () => {
    const shape = toFetchMockShape(edge);

    expect(shape.msPerKbitDown).toBeCloseTo(1000 / edge.bwDownKbps, 6);
    expect(shape.msPerKbitUp).toBeCloseTo(1000 / edge.bwUpKbps, 6);
  });

  it('does NOT force low for the normal control profile', () => {
    const shape = toFetchMockShape(normal);
    expect(shape.forcedDataModePreference).not.toBe('low');
  });

  it('emits no raw KB/s field (conversion belongs to toToxics only)', () => {
    const shape = toFetchMockShape(edge) as Record<string, unknown>;
    expect(shape).not.toHaveProperty('rateKBs');
    expect(shape).not.toHaveProperty('rateKbytesPerSec');
  });
});

describe('toMiddlewareDescriptor (W1-REG-07b)', () => {
  it('maps 2g to the L2 descriptor with delay/jitter/loss/ingress', () => {
    const d = toMiddlewareDescriptor(twoG);

    expect(d.delayMs).toBe(twoG.latencyMs);
    expect(d.jitterMs).toBe(twoG.jitterMs);
    expect(d.failProbability).toBeCloseTo(twoG.lossPct, 10);
    expect(d.ingressKbps).toBe(twoG.bwUpKbps);
  });

  it('derives a positive sseChunkDelayMs that is larger for slower bandwidth', () => {
    const slow = toMiddlewareDescriptor(twoG);
    const fast = toMiddlewareDescriptor(normal);

    expect(slow.sseChunkDelayMs).toBeGreaterThan(0);
    expect(slow.sseChunkDelayMs).toBeGreaterThan(fast.sseChunkDelayMs);
  });

  it('emits no raw KB/s field (conversion belongs to toToxics only)', () => {
    const d = toMiddlewareDescriptor(twoG) as Record<string, unknown>;
    expect(d).not.toHaveProperty('rateKBs');
    expect(d).not.toHaveProperty('rateKbytesPerSec');
  });
});

/**
 * The both-streams contract (spec §NFR): green adds a per-toxic
 * `stream?: 'upstream' | 'downstream'` to `ToxiproxyToxic` so the mapper shapes
 * both directions. We assert against that future field via a local widening so the
 * contract is expressed test-first without touching the mapper in red.
 */
type StreamedToxic = ToxiproxyToxic & { readonly stream?: 'upstream' | 'downstream' };

const toxicStream = (t: ToxiproxyToxic): 'upstream' | 'downstream' | undefined =>
  (t as StreamedToxic).stream;

const rateOf = (t: ToxiproxyToxic | undefined): number | undefined =>
  (t?.attributes as { rate?: number } | undefined)?.rate;

describe('toToxics (W1-REG-07c — the single kbps→KB/s site, both streams)', () => {
  it('shapes BOTH streams: upstream rate = bwUpKbps/8 (11.25), downstream rate = bwDownKbps/8 (25)', () => {
    const toxics = toToxics(edge);

    const up = toxics.find(
      (t: ToxiproxyToxic) => t.type === 'bandwidth' && toxicStream(t) === 'upstream',
    );
    const down = toxics.find(
      (t: ToxiproxyToxic) => t.type === 'bandwidth' && toxicStream(t) === 'downstream',
    );
    expect(up).toBeDefined();
    expect(down).toBeDefined();

    // kbps → KB/s is performed ONCE per direction, here only.
    expect(rateOf(up)).toBeCloseTo(edge.bwUpKbps / 8, 6);
    expect(rateOf(up)).toBeCloseTo(11.25, 6);
    expect(rateOf(down)).toBeCloseTo(edge.bwDownKbps / 8, 6);
    expect(rateOf(down)).toBeCloseTo(25, 6);

    // Exactly the two bandwidth streams (no extras, none dropped).
    const bandwidthStreams = toxics
      .filter((t: ToxiproxyToxic) => t.type === 'bandwidth')
      .map((t: ToxiproxyToxic) => toxicStream(t))
      .sort();
    expect(bandwidthStreams).toEqual(['downstream', 'upstream']);
  });

  it('emits blocking/timeout toxics on BOTH streams for offline (bandwidth 0)', () => {
    const toxics = toToxics(offline);

    expect(toxics.length).toBeGreaterThan(0);
    const isBlocking = (t: ToxiproxyToxic): boolean =>
      t.type === 'timeout' || (t.type === 'bandwidth' && rateOf(t) === 0);

    const blockingUp = toxics.some(
      (t: ToxiproxyToxic) => toxicStream(t) === 'upstream' && isBlocking(t),
    );
    const blockingDown = toxics.some(
      (t: ToxiproxyToxic) => toxicStream(t) === 'downstream' && isBlocking(t),
    );
    expect(blockingUp).toBe(true);
    expect(blockingDown).toBe(true);
  });
});
