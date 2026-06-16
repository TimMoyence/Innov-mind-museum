/**
 * W3-01 (RED) — profile-to-toxics CLI unit test (spawn the real script).
 *
 * spec.md §EARS R1 + design.md §Architecture (1): the standalone Node script
 * `scripts/net-shaping/profile-to-toxics.mjs` (created in W3-02) emits Toxiproxy
 * admin-API JSON for every profile in `NETWORK_PROFILES`, DERIVED from the W1
 * `toToxics` mapper (`@shared/net-shaping/networkProfiles`). Invariants asserted:
 *   - emits one admin-toxic object per `ToxiproxyToxic` returned by `toToxics`,
 *     carrying `{name, type, stream, attributes}` (Toxiproxy admin shape), and the
 *     admin `stream` is taken FROM the mapper toxic (`toxic.stream`), NOT hard-coded;
 *   - spec §NFR "both streams sole shaper": `toToxics` shapes BOTH directions —
 *     an UPSTREAM bandwidth toxic (rate = bwUpKbps / 8) AND a DOWNSTREAM bandwidth
 *     toxic (rate = bwDownKbps / 8) — so the uplink (upload-compression flow) and
 *     the downlink (chat SSE / image bytes) are each shaped to their own bandwidth;
 *   - the bandwidth rates are obtained FROM `toToxics`, NOT from an inline kbps→KB/s
 *     literal (the source must not re-implement the `/ 8` conversion — DRY single-site);
 *   - `edge` yields a latency toxic + an upstream bandwidth toxic (rate =
 *     round(90/8) = 11) + a downstream bandwidth toxic (rate = 200/8 = 25) —
 *     Toxiproxy's `rate` is a Go int64, so the conversion rounds to a whole KB/s
 *     (a fractional 11.25 is rejected by the admin API with HTTP 400);
 *   - `offline` (lossPct 1, bw 0) yields blocking toxics on BOTH streams (zero-rate
 *     bandwidth so the proxy drops both directions — no traffic passes either way).
 *
 * RED state: the script does not exist yet → `node <missing-file>` exits non-zero
 * and produces no parseable stdout → every assertion fails for the right reason.
 *
 * Runtime-deferred (UFR-013): W3-06/07 (Maestro netshape flows + maestro-netshape
 * CI job + compression wall-clock metric) are NIGHTLY-only and are NOT covered by
 * this unit test — device→proxy needs an emulator + a running proxy in CI.
 *
 * lib-docs: none — node:child_process / node:fs / node:path (stdlib) + the local
 *   `@shared/net-shaping/networkProfiles` TS module (no external library). No
 *   inline test entities; the registry is the real frozen source of truth.
 *
 * Frozen-test invariant: byte-immutable once manifested (phase=green).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  NETWORK_PROFILES,
  toToxics,
  type NetworkProfileName,
  type ToxiproxyToxic,
} from '@shared/net-shaping/networkProfiles';

// __dirname = museum-backend/tests/unit/net-shaping → repo root is four up.
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'net-shaping', 'profile-to-toxics.mjs');

/** One Toxiproxy admin-API toxic entry as emitted by the script. */
interface AdminToxic {
  readonly name: string;
  readonly type: ToxiproxyToxic['type'];
  readonly stream: 'upstream' | 'downstream';
  readonly attributes: Record<string, number>;
}

/**
 * The both-streams contract (spec §NFR): green will add a per-toxic
 * `stream?: 'upstream' | 'downstream'` to `ToxiproxyToxic` so the mapper shapes
 * both directions. We assert against that future field via this local widening so
 * the contract is expressed test-first without touching production code in red.
 */
type StreamedToxic = ToxiproxyToxic & { readonly stream?: 'upstream' | 'downstream' };

/** Read the (future) per-toxic stream the green mapper will carry. */
function toxicStream(t: ToxiproxyToxic): 'upstream' | 'downstream' | undefined {
  return (t as StreamedToxic).stream;
}

function runScript(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('node', [SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/**
 * Parse the script stdout as JSON; throws (failing the test) on absent/invalid.
 * @param args
 */
function parseToxics(args: string[]): AdminToxic[] {
  const { status, stdout } = runScript(args);
  expect(status).toBe(0);
  const parsed: unknown = JSON.parse(stdout);
  expect(Array.isArray(parsed)).toBe(true);
  return parsed as AdminToxic[];
}

const ALL_PROFILE_NAMES = Object.keys(NETWORK_PROFILES) as NetworkProfileName[];

describe('profile-to-toxics CLI (W3-01)', () => {
  it('the script exists at the canonical path (W3-02)', () => {
    // Documents the expected location; RED until W3-02 creates it.
    expect(existsSync(SCRIPT)).toBe(true);
  });

  it.each(ALL_PROFILE_NAMES)(
    'emits admin-shaped toxics for profile "%s" matching toToxics() count + types',
    (name) => {
      const admin = parseToxics([name]);
      const expected = toToxics(NETWORK_PROFILES[name]);

      // One admin toxic per ToxiproxyToxic the W1 mapper returns.
      expect(admin).toHaveLength(expected.length);

      // Each admin entry carries the Toxiproxy admin-API shape.
      for (const t of admin) {
        expect(typeof t.name).toBe('string');
        expect(t.name.length).toBeGreaterThan(0);
        expect(['upstream', 'downstream']).toContain(t.stream);
        expect(typeof t.attributes).toBe('object');
        expect(t.attributes).not.toBeNull();
      }

      // The toxic TYPES are exactly those produced by toToxics (no extras,
      // none dropped).
      expect(admin.map((t) => t.type).sort()).toEqual(expected.map((t) => t.type).sort());

      // spec §NFR "both streams sole shaper": every non-offline profile shapes
      // BOTH directions — the mapper returns an upstream AND a downstream bandwidth
      // toxic, and the admin envelope carries the mapper's own `stream` verbatim
      // (NOT a hard-coded 'downstream'). Pair the admin entries to the mapper
      // entries by (type, stream) and assert the stream set covers both directions.
      const expectedStreamByKey = new Map(
        expected
          .filter((t) => t.type === 'bandwidth')
          .map((t) => [`${t.type}:${toxicStream(t) ?? ''}`, toxicStream(t)] as const),
      );
      const expectedBandwidthStreams = expected
        .filter((t) => t.type === 'bandwidth')
        .map((t) => toxicStream(t))
        .sort();
      expect(expectedBandwidthStreams).toEqual(['downstream', 'upstream']);

      const adminBandwidthStreams = admin
        .filter((t) => t.type === 'bandwidth')
        .map((t) => t.stream)
        .sort();
      expect(adminBandwidthStreams).toEqual(['downstream', 'upstream']);

      // Every admin bandwidth toxic's stream must match a mapper bandwidth toxic
      // (envelope did not invent / hard-code the stream).
      for (const t of admin.filter((x) => x.type === 'bandwidth')) {
        expect(expectedStreamByKey.has(`bandwidth:${t.stream}`)).toBe(true);
      }
    },
  );

  it('derives both stream bandwidth rates from toToxics (edge: up round(90/8)=11, down 200/8=25 KB/s; Toxiproxy int64)', () => {
    const admin = parseToxics(['edge']);
    const expected = toToxics(NETWORK_PROFILES.edge);

    const expectedUp = expected.find(
      (t) => t.type === 'bandwidth' && toxicStream(t) === 'upstream',
    );
    const expectedDown = expected.find(
      (t) => t.type === 'bandwidth' && toxicStream(t) === 'downstream',
    );
    expect(expectedUp).toBeDefined();
    expect(expectedDown).toBeDefined();
    // The mapper converts kbps→KB/s once, per direction, rounding to a whole KB/s
    // because Toxiproxy's `rate` is a Go int64 (a fractional 11.25 → HTTP 400).
    expect(expectedUp?.attributes.rate).toBe(Math.round(NETWORK_PROFILES.edge.bwUpKbps / 8));
    expect(expectedUp?.attributes.rate).toBe(11);
    expect(expectedDown?.attributes.rate).toBe(Math.round(NETWORK_PROFILES.edge.bwDownKbps / 8));
    expect(expectedDown?.attributes.rate).toBe(25);
    // Every emitted rate MUST be an integer or Toxiproxy rejects the toxic (regression guard).
    expect(Number.isInteger(expectedUp?.attributes.rate)).toBe(true);
    expect(Number.isInteger(expectedDown?.attributes.rate)).toBe(true);

    const adminUp = admin.find((t) => t.type === 'bandwidth' && t.stream === 'upstream');
    const adminDown = admin.find((t) => t.type === 'bandwidth' && t.stream === 'downstream');
    expect(adminUp).toBeDefined();
    expect(adminDown).toBeDefined();
    // The CLI must surface the SAME per-direction values it got from the mapper.
    expect(adminUp?.attributes.rate).toBe(expectedUp?.attributes.rate);
    expect(adminDown?.attributes.rate).toBe(expectedDown?.attributes.rate);

    // edge must carry a latency toxic too.
    expect(admin.some((t) => t.type === 'latency')).toBe(true);
  });

  it('emits blocking toxics on BOTH streams for the offline profile', () => {
    const admin = parseToxics(['offline']);
    // offline (lossPct=1, bw=0) must drop BOTH directions — a zero-rate bandwidth
    // (or timeout) toxic on each of upstream + downstream so no traffic passes
    // either way (spec §NFR both-streams).
    const isBlocking = (t: AdminToxic): boolean =>
      t.type === 'timeout' || (t.type === 'bandwidth' && t.attributes.rate === 0);

    const blockingUp = admin.some((t) => t.stream === 'upstream' && isBlocking(t));
    const blockingDown = admin.some((t) => t.stream === 'downstream' && isBlocking(t));
    expect(blockingUp).toBe(true);
    expect(blockingDown).toBe(true);
  });

  it('does NOT re-implement the kbps→KB/s conversion inline (it consumes toToxics)', () => {
    // The single conversion site is `kbpsToKBytesPerSec` inside toToxics
    // (networkProfiles.ts). The script MUST import/consume that mapper rather
    // than hard-coding a `/ 8` or `* 0.125` bandwidth conversion of its own.
    expect(existsSync(SCRIPT)).toBe(true);
    const source = readFileSync(SCRIPT, 'utf8');
    const conversionLiterals = [/\bbwUpKbps\b[^\n]*\/\s*8\b/, /\/\s*8\b[^\n]*KB/, /\*\s*0\.125\b/];
    for (const re of conversionLiterals) {
      expect(source).not.toMatch(re);
    }
  });
});
