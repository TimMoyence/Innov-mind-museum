/**
 * Network Profile Registry — the keystone of the weak-network test track.
 *
 * Authoritative spec:
 *   docs/superpowers/specs/2026-06-01-weak-network-resilience-and-test-track-design.md
 *   §"The Profile Registry (the keystone)".
 * Cycle artefacts:
 *   .claude/skills/team/team-state/2026-06-01-weak-net-registry/{spec,design,tasks}.md
 *
 * A single, frozen, dependency-free registry of the six network conditions the
 * test track exercises. It is the source of truth shared (byte-identical data
 * region) with the backend copy at `museum-backend/src/shared/net-shaping/
 * networkProfiles.ts`; the parity sentinel `scripts/sentinels/net-profiles-parity.mjs`
 * guards that the two never drift.
 *
 * PURITY (EARS R6): this module imports neither `react` nor
 * `@react-native-community/netinfo`. It only describes data and emits plain
 * shapes; the `toNetInfoSnapshot` helper produces a structural snapshot that the
 * REAL `resolveDataMode` (DataModeProvider) can consume without this module ever
 * pulling NetInfo in. The single kbps→KB/s conversion lives in `toToxics` (DRY,
 * EARS R4).
 */

// ── Types ────────────────────────────────────────────────────────────────────

/** NetInfo connection type (subset we model). */
export type NetinfoType = 'none' | 'cellular' | 'wifi';

/** Cellular generation as surfaced by NetInfo's `details.cellularGeneration`. */
export type CellularGeneration = '2g' | '3g' | '4g' | '5g';

/** The six ratified profile names. */
export type NetworkProfileName = 'offline' | '2g' | 'edge' | '3g-lossy' | 'flapping' | 'normal';

/** Resolved data mode the profile is expected to drive `resolveDataMode` to. */
export type ExpectedDataMode = 'low' | 'normal';

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
// The markers below are LOAD-BEARING: the BE↔FE parity contract + the sentinel
// hash ONLY the bytes between them, so the literal must stay self-contained
// (no imports/comments-with-paths inside) and be copied verbatim to the BE file.

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
    }),
  },
);
// <<< NETWORK_PROFILES_DATA_REGION_END

// ── Snapshot helper (W1-REG-04) ────────────────────────────────────────────────

/**
 * Builds a structural NetInfo snapshot for a profile, consumable by the REAL
 * `resolveDataMode('auto', snapshot)`. `isConnectionExpensive` is nested under
 * `details` (mirrors NetInfo's real shape — design anchor §3).
 *
 * @param profile a ratified network profile.
 * @param options.online override the connected state. Defaults to "connected"
 *   for every profile except `offline`. For `flapping`, pass `{online:false}`
 *   to model the disconnected window and `{online:true}` for the online window.
 */
export function toNetInfoSnapshot(
  profile: NetworkProfile,
  options?: { online?: boolean },
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
      isConnectionExpensive: false,
      cellularGeneration: profile.cellularGeneration,
    },
  };
}

// ── Flap schedule (W1-REG-06) ──────────────────────────────────────────────────

/**
 * Deterministic duty-cycle phase math for the flapping profile.
 *
 * `phase = elapsedMs % (onlineMs + offlineMs)`; online while `phase < onlineMs`.
 * Pure: `elapsedMs` is injected, no `Date.now` / `Math.random`.
 *
 * @throws if the profile carries no `dutyCycle` (non-flapping).
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

// ── Mappers (W1-REG-08) ────────────────────────────────────────────────────────

/**
 * L1 Jest fetch-mock shape. Carries a `string` index signature so harnesses
 * (and the contract tests) can index it generically — it is a loosely-typed
 * config descriptor, not a domain entity.
 */
export interface FetchMockShape {
  readonly preResponseDelayMs: number;
  readonly failProbability: number;
  readonly msPerKbitDown: number;
  readonly msPerKbitUp: number;
  readonly netinfo: NetInfoSnapshot;
  readonly forcedDataModePreference?: 'low' | 'normal';
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

/** kbps → KB/s. THE SINGLE conversion site (DRY, EARS R4) — only `toToxics` calls it. */
function kbpsToKBytesPerSec(kbps: number): number {
  return kbps / 8;
}

/** Per-kbit time cost (ms) for a given bandwidth; `Infinity` when bandwidth is 0. */
function msPerKbit(bwKbps: number): number {
  return bwKbps === 0 ? Number.POSITIVE_INFINITY : 1000 / bwKbps;
}

/**
 * L1 — translate a profile into the Jest fetch-mock shape. `forcedDataModePreference`
 * is only forced for low-data profiles; the `normal` control profile leaves it
 * un-forced (`'normal'`), never `'low'`.
 */
export function toFetchMockShape(profile: NetworkProfile): FetchMockShape {
  return {
    preResponseDelayMs: profile.latencyMs,
    failProbability: profile.lossPct,
    msPerKbitDown: msPerKbit(profile.bwDownKbps),
    msPerKbitUp: msPerKbit(profile.bwUpKbps),
    netinfo: toNetInfoSnapshot(profile),
    forcedDataModePreference: profile.expectedDataMode,
  };
}

/**
 * L2 — translate a profile into an Express middleware descriptor. `sseChunkDelayMs`
 * scales inversely with downlink bandwidth (slower profile → larger inter-chunk
 * delay). `ingressKbps` is the uplink bandwidth (no KB/s conversion here).
 */
export function toMiddlewareDescriptor(profile: NetworkProfile): MiddlewareDescriptor {
  // Larger for slower bandwidth: chunk delay is proportional to ms-per-kbit of
  // the downlink. `normal` (20000 kbps) → tiny; `2g` (100 kbps) → much larger.
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
 * L3 — translate a profile into Toxiproxy toxics. This is the ONLY place the
 * kbps→KB/s conversion is performed (`bwUpKbps / 8`). Offline emits a blocking
 * bandwidth-0 toxic.
 */
export function toToxics(profile: NetworkProfile): ToxiproxyToxic[] {
  const toxics: ToxiproxyToxic[] = [
    {
      type: 'latency',
      attributes: { latency: profile.latencyMs, jitter: profile.jitterMs },
    },
    {
      type: 'bandwidth',
      attributes: { rate: kbpsToKBytesPerSec(profile.bwUpKbps) },
    },
  ];

  return toxics;
}
