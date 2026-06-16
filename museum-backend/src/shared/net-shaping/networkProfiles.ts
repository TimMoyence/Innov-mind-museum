/**
 * Network Profile Registry — backend vendored copy.
 *
 * Authoritative spec:
 *   docs/superpowers/specs/2026-06-01-weak-network-resilience-and-test-track-design.md
 *   §"The Profile Registry (the keystone)".
 *   Re-ratified at 10 profiles by run `undefined-network-detection-reliability`
 *   (US-11.1/US-11.2 — cost axis `metered` + engine verdict `expectedQuality`).
 *
 * BYTE-IDENTICAL data region with the frontend source of truth
 * (`museum-frontend/shared/infrastructure/connectivity/networkProfiles.ts`). The
 * region between the load-bearing markers below is hashed by both the contract
 * test (`tests/contract/network-profiles-parity.test.ts`) and the parity
 * sentinel (`scripts/sentinels/net-profiles-parity.mjs`) — any drift = CI red.
 *
 * Self-contained (no cross-module imports) so it can be consumed via
 * `@shared/net-shaping/networkProfiles` from any backend net-shaping harness.
 */

// ── Types ────────────────────────────────────────────────────────────────────

/** NetInfo connection type (subset we model). */
export type NetinfoType = 'none' | 'cellular' | 'wifi';

/** Cellular generation as surfaced by NetInfo's `details.cellularGeneration`. */
export type CellularGeneration = '2g' | '3g' | '4g' | '5g';

/** The ten ratified profile names. */
export type NetworkProfileName =
  | 'offline'
  | '2g'
  | 'edge'
  | '3g-lossy'
  | 'flapping'
  | 'normal'
  | '4g'
  | '5g'
  | 'wifi-metered'
  | 'cellular-degraded';

/**
 * Data mode the profile is expected to drive the REAL `resolveDataMode` to by
 * LABEL ALONE, with an EMPTY measurement window (quality `'unknown'`, US-11.4).
 * The measurement verdict lives on the separate {@link ExpectedQuality} axis:
 * `cellular-degraded` is `'normal'` here (healthy 4g label) yet `'slow'` there.
 */
export type ExpectedDataMode = 'low' | 'normal';

/**
 * Quality-ENGINE verdict the profile's derived samples must land on (D-04 —
 * an EXPLICIT data-region field, never derived inside a test).
 */
export type ExpectedQuality = 'ok' | 'slow';

/** Connect/disconnect schedule attached ONLY to the flapping profile. */
export interface DutyCycle {
  readonly onlineMs: number;
  readonly offlineMs: number;
  readonly baseProfile: NetworkProfileName;
}

/** A single ratified network condition. */
export interface NetworkProfile {
  readonly name: NetworkProfileName;
  readonly label: string;
  readonly latencyMs: number;
  readonly jitterMs: number;
  readonly bwDownKbps: number;
  readonly bwUpKbps: number;
  /** Packet-loss fraction in [0,1]. */
  readonly lossPct: number;
  readonly netinfoType: NetinfoType;
  readonly cellularGeneration: CellularGeneration | null;
  readonly expectedDataMode: ExpectedDataMode;
  /**
   * COST axis (US-11.2): source of `details.isConnectionExpensive` in
   * snapshots. All cellular profiles are metered; plain wifi + offline are not;
   * `wifi-metered` models the Android hotspot/metered-wifi case (US-02.6).
   */
  readonly metered: boolean;
  /** Engine verdict for profile-derived samples; `null` = offline (no samples possible). */
  readonly expectedQuality: ExpectedQuality | null;
  /** Present ONLY on `flapping`. */
  readonly dutyCycle?: DutyCycle;
}

/** One tick of a flapping schedule: whether we are online + which base profile applies. */
export interface FlapTick {
  readonly online: boolean;
  readonly baseProfile: NetworkProfile;
}

/** A Toxiproxy toxic descriptor (L3 layer). */
export interface ToxiproxyToxic {
  readonly type: 'latency' | 'bandwidth' | 'timeout' | 'slicer';
  /**
   * The link direction this toxic shapes. `upstream` = client→server (uploads),
   * `downstream` = server→client (chat SSE / image bytes). A latency toxic is
   * applied symmetrically and carries no `stream`; the two bandwidth toxics each
   * carry their own direction so the uplink and downlink are shaped independently.
   */
  readonly stream?: 'upstream' | 'downstream';
  readonly attributes: Readonly<Record<string, number>>;
}

/** Structural NetInfo snapshot consumable by the REAL `resolveDataMode`. */
export interface NetInfoSnapshot {
  readonly isConnected: boolean | null;
  readonly type: string;
  readonly details: {
    readonly isConnectionExpensive: boolean;
    readonly cellularGeneration: string | null;
  } | null;
}

// ── Registry (data region — byte-identical FE↔BE; see parity sentinel) ─────────

// >>> NETWORK_PROFILES_DATA_REGION_START
export const NETWORK_PROFILES: Readonly<Record<NetworkProfileName, NetworkProfile>> = Object.freeze(
  {
    offline: Object.freeze({
      name: 'offline',
      label: 'Offline (no connectivity)',
      latencyMs: 0,
      jitterMs: 0,
      bwDownKbps: 0,
      bwUpKbps: 0,
      lossPct: 1,
      netinfoType: 'none',
      cellularGeneration: null,
      expectedDataMode: 'low',
      metered: false,
      expectedQuality: null,
    }),
    '2g': Object.freeze({
      name: '2g',
      label: '2G (slow cellular)',
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
    }),
    edge: Object.freeze({
      name: 'edge',
      label: 'EDGE (2.5G)',
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
    }),
    '3g-lossy': Object.freeze({
      name: '3g-lossy',
      label: '3G (lossy)',
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
    }),
    flapping: Object.freeze({
      name: 'flapping',
      label: 'Flapping (on/off cellular)',
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
      dutyCycle: Object.freeze({
        onlineMs: 5000,
        offlineMs: 3000,
        baseProfile: '3g-lossy',
      }),
    }),
    normal: Object.freeze({
      name: 'normal',
      label: 'Normal (wifi / control)',
      latencyMs: 25,
      jitterMs: 10,
      bwDownKbps: 20000,
      bwUpKbps: 8000,
      lossPct: 0,
      netinfoType: 'wifi',
      cellularGeneration: null,
      expectedDataMode: 'normal',
      metered: false,
      expectedQuality: 'ok',
    }),
    '4g': Object.freeze({
      name: '4g',
      label: '4G (healthy cellular)',
      latencyMs: 175,
      jitterMs: 50,
      bwDownKbps: 1600,
      bwUpKbps: 700,
      lossPct: 0,
      netinfoType: 'cellular',
      cellularGeneration: '4g',
      expectedDataMode: 'normal',
      metered: true,
      expectedQuality: 'ok',
    }),
    '5g': Object.freeze({
      name: '5g',
      label: '5G (healthy cellular)',
      latencyMs: 60,
      jitterMs: 20,
      bwDownKbps: 10000,
      bwUpKbps: 5000,
      lossPct: 0,
      netinfoType: 'cellular',
      cellularGeneration: '5g',
      expectedDataMode: 'normal',
      metered: true,
      expectedQuality: 'ok',
    }),
    'wifi-metered': Object.freeze({
      name: 'wifi-metered',
      label: 'WiFi (metered hotspot)',
      latencyMs: 80,
      jitterMs: 30,
      bwDownKbps: 5000,
      bwUpKbps: 2000,
      lossPct: 0,
      netinfoType: 'wifi',
      cellularGeneration: null,
      expectedDataMode: 'normal',
      metered: true,
      expectedQuality: 'ok',
    }),
    'cellular-degraded': Object.freeze({
      name: 'cellular-degraded',
      label: 'Cellular degraded (5G one-bar basement)',
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
    }),
  },
);
// <<< NETWORK_PROFILES_DATA_REGION_END

// ── Snapshot helper ────────────────────────────────────────────────────────────

/**
 * Builds a structural NetInfo snapshot for a profile, consumable by the REAL
 * `resolveDataMode('auto', snapshot, quality)`. `isConnectionExpensive` is
 * nested under `details` (mirrors NetInfo's real shape) and DERIVES from
 * `profile.metered` on the online branch (US-11.3). The offline branch forces
 * it `false`, override included: no cost without an interface (US-02.5).
 */
export function toNetInfoSnapshot(
  profile: NetworkProfile,
  options?: { online?: boolean; isConnectionExpensive?: boolean },
): NetInfoSnapshot {
  const defaultOnline = profile.netinfoType !== 'none';
  const online = options?.online ?? defaultOnline;

  if (!online) {
    return {
      isConnected: false,
      type: 'none',
      details: {
        isConnectionExpensive: false,
        cellularGeneration: null,
      },
    };
  }

  return {
    isConnected: true,
    type: profile.netinfoType,
    details: {
      isConnectionExpensive: options?.isConnectionExpensive ?? profile.metered,
      cellularGeneration: profile.cellularGeneration,
    },
  };
}

// ── Flap schedule ──────────────────────────────────────────────────────────────

/**
 * Deterministic duty-cycle phase math for the flapping profile.
 *
 * `phase = elapsedMs % (onlineMs + offlineMs)`; online while `phase < onlineMs`.
 *
 * @throws {Error} if the profile carries no `dutyCycle` (non-flapping).
 */
export function flapScheduleAt(profile: NetworkProfile, elapsedMs: number): FlapTick {
  const cycle = profile.dutyCycle;
  if (cycle === undefined) {
    throw new Error(
      `flapScheduleAt: profile "${profile.name}" has no dutyCycle (not a flapping profile)`,
    );
  }

  const period = cycle.onlineMs + cycle.offlineMs;
  const phase = ((elapsedMs % period) + period) % period;
  const online = phase < cycle.onlineMs;

  return {
    online,
    baseProfile: NETWORK_PROFILES[cycle.baseProfile],
  };
}

// ── Mappers ──────────────────────────────────────────────────────────────────

/**
 * L1 Jest fetch-mock shape. Carries a `string` index signature so harnesses
 * (and the contract tests) can index it generically — it is a loosely-typed
 * config descriptor, not a domain entity.
 *
 * `forcedDataModePreference` was REMOVED (US-11.6 / UFR-016 burial): the old
 * mapper forced the preference for EVERY profile, so the L1 harness never
 * exercised the real `auto` resolution.
 */
export interface FetchMockShape {
  readonly preResponseDelayMs: number;
  readonly failProbability: number;
  readonly msPerKbitDown: number;
  readonly msPerKbitUp: number;
  readonly netinfo: NetInfoSnapshot;
  readonly [key: string]: unknown;
}

/**
 * L2 Express middleware descriptor shape. Carries a `string` index signature for
 * the same generic-indexing reason as {@link FetchMockShape}.
 */
export interface MiddlewareDescriptor {
  readonly delayMs: number;
  readonly jitterMs: number;
  readonly failProbability: number;
  readonly sseChunkDelayMs: number;
  readonly ingressKbps: number;
  readonly [key: string]: unknown;
}

/**
 * kbps → KB/s. THE SINGLE conversion site (DRY) — only `toToxics` calls it.
 * Toxiproxy's bandwidth toxic `rate` is a Go `int64` (KB/s): a fractional rate
 * (e.g. edge 90 kbps / 8 = 11.25) is rejected by the admin API with HTTP 400
 * ("cannot unmarshal number 11.25 into Go struct field BandwidthToxic.attributes.rate
 * of type int64"). Round to the nearest whole KB/s, flooring any non-zero
 * bandwidth to ≥1 so a tiny profile never collapses to a 0-rate (blocking) toxic;
 * offline (0 kbps) stays 0 — the intended zero-rate blocking toxic.
 */
function kbpsToKBytesPerSec(kbps: number): number {
  return kbps === 0 ? 0 : Math.max(1, Math.round(kbps / 8));
}

/** Per-kbit time cost (ms) for a given bandwidth; `Infinity` when bandwidth is 0. */
function msPerKbit(bwKbps: number): number {
  return bwKbps === 0 ? Number.POSITIVE_INFINITY : 1000 / bwKbps;
}

/**
 * L1 — translate a profile into the Jest fetch-mock shape. No data-mode
 * preference is forced (US-11.6): the harness exercises the REAL `auto`
 * resolution against the metered-derived `netinfo` snapshot.
 */
export function toFetchMockShape(profile: NetworkProfile): FetchMockShape {
  return {
    preResponseDelayMs: profile.latencyMs,
    failProbability: profile.lossPct,
    msPerKbitDown: msPerKbit(profile.bwDownKbps),
    msPerKbitUp: msPerKbit(profile.bwUpKbps),
    netinfo: toNetInfoSnapshot(profile),
  };
}

/** L2 — translate a profile into an Express middleware descriptor. */
export function toMiddlewareDescriptor(profile: NetworkProfile): MiddlewareDescriptor {
  const sseChunkDelayMs = Math.round(msPerKbit(profile.bwDownKbps) * 1000);

  return {
    delayMs: profile.latencyMs,
    jitterMs: profile.jitterMs,
    failProbability: profile.lossPct,
    sseChunkDelayMs,
    ingressKbps: profile.bwUpKbps,
  };
}

/**
 * L3 — translate a profile into Toxiproxy toxics shaping BOTH directions. This is
 * the ONLY place the kbps→KB/s conversion is performed (`bwUpKbps / 8`,
 * `bwDownKbps / 8`). The latency toxic is symmetric; the two bandwidth toxics each
 * carry their own `stream` so the uplink (upload-compression flow) and downlink
 * (chat SSE / image bytes) are shaped independently. Offline (bw 0) emits a
 * zero-rate (blocking) bandwidth toxic on each stream so no traffic passes either
 * way. THE SINGLE conversion site (DRY) — only `toToxics` calls `kbpsToKBytesPerSec`.
 */
export function toToxics(profile: NetworkProfile): ToxiproxyToxic[] {
  const toxics: ToxiproxyToxic[] = [
    {
      type: 'latency',
      attributes: { latency: profile.latencyMs, jitter: profile.jitterMs },
    },
    {
      type: 'bandwidth',
      stream: 'upstream',
      attributes: { rate: kbpsToKBytesPerSec(profile.bwUpKbps) },
    },
    {
      type: 'bandwidth',
      stream: 'downstream',
      attributes: { rate: kbpsToKBytesPerSec(profile.bwDownKbps) },
    },
  ];

  return toxics;
}
