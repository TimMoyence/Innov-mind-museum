import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  NETWORK_PROFILES,
  toToxics,
  type NetworkProfileName,
  type ToxiproxyToxic,
} from '@shared/net-shaping/networkProfiles';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'net-shaping', 'profile-to-toxics.mjs');

interface AdminToxic {
  readonly name: string;
  readonly type: ToxiproxyToxic['type'];
  readonly stream: 'upstream' | 'downstream';
  readonly attributes: Record<string, number>;
}

type StreamedToxic = ToxiproxyToxic & { readonly stream?: 'upstream' | 'downstream' };

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
    expect(existsSync(SCRIPT)).toBe(true);
  });

  it.each(ALL_PROFILE_NAMES)(
    'emits admin-shaped toxics for profile "%s" matching toToxics() count + types',
    (name) => {
      const admin = parseToxics([name]);
      const expected = toToxics(NETWORK_PROFILES[name]);

      expect(admin).toHaveLength(expected.length);

      for (const t of admin) {
        expect(typeof t.name).toBe('string');
        expect(t.name.length).toBeGreaterThan(0);
        expect(['upstream', 'downstream']).toContain(t.stream);
        expect(typeof t.attributes).toBe('object');
        expect(t.attributes).not.toBeNull();
      }

      expect(admin.map((t) => t.type).sort()).toEqual(expected.map((t) => t.type).sort());

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
    expect(expectedUp?.attributes.rate).toBe(Math.round(NETWORK_PROFILES.edge.bwUpKbps / 8));
    expect(expectedUp?.attributes.rate).toBe(11);
    expect(expectedDown?.attributes.rate).toBe(Math.round(NETWORK_PROFILES.edge.bwDownKbps / 8));
    expect(expectedDown?.attributes.rate).toBe(25);
    expect(Number.isInteger(expectedUp?.attributes.rate)).toBe(true);
    expect(Number.isInteger(expectedDown?.attributes.rate)).toBe(true);

    const adminUp = admin.find((t) => t.type === 'bandwidth' && t.stream === 'upstream');
    const adminDown = admin.find((t) => t.type === 'bandwidth' && t.stream === 'downstream');
    expect(adminUp).toBeDefined();
    expect(adminDown).toBeDefined();
    expect(adminUp?.attributes.rate).toBe(expectedUp?.attributes.rate);
    expect(adminDown?.attributes.rate).toBe(expectedDown?.attributes.rate);

    expect(admin.some((t) => t.type === 'latency')).toBe(true);
  });

  it('emits blocking toxics on BOTH streams for the offline profile', () => {
    const admin = parseToxics(['offline']);
    const isBlocking = (t: AdminToxic): boolean =>
      t.type === 'timeout' || (t.type === 'bandwidth' && t.attributes.rate === 0);

    const blockingUp = admin.some((t) => t.stream === 'upstream' && isBlocking(t));
    const blockingDown = admin.some((t) => t.stream === 'downstream' && isBlocking(t));
    expect(blockingUp).toBe(true);
    expect(blockingDown).toBe(true);
  });

  it('does NOT re-implement the kbps→KB/s conversion inline (it consumes toToxics)', () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const source = readFileSync(SCRIPT, 'utf8');
    const conversionLiterals = [/\bbwUpKbps\b[^\n]*\/\s*8\b/, /\/\s*8\b[^\n]*KB/, /\*\s*0\.125\b/];
    for (const re of conversionLiterals) {
      expect(source).not.toMatch(re);
    }
  });
});
