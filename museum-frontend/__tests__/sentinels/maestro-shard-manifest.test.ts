import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SENTINEL = join(
  __dirname,
  '..',
  '..',
  '..',
  'scripts',
  'sentinels',
  'maestro-shard-manifest.mjs',
);

function runSentinel(repoRoot: string): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('node', [SENTINEL], {
      env: { ...process.env, MAESTRO_REPO_ROOT: repoRoot },
      encoding: 'utf-8',
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: Buffer; stderr?: Buffer };
    return {
      code: e.status ?? 1,
      stdout: e.stdout?.toString() ?? '',
      stderr: e.stderr?.toString() ?? '',
    };
  }
}

function setupFakeRepo(opts: {
  flows: string[];
  manifestFlows: string[][]; // one inner array per shard
}): string {
  const root = mkdtempSync(join(tmpdir(), 'maestro-sentinel-'));
  const maestroDir = join(root, 'museum-frontend', '.maestro');
  mkdirSync(maestroDir, { recursive: true });
  for (const f of opts.flows) {
    writeFileSync(join(maestroDir, f), '# fake flow\n');
  }
  writeFileSync(
    join(maestroDir, 'shards.json'),
    JSON.stringify({
      shards: opts.manifestFlows.map((flows, i) => ({ name: `shard${i}`, flows })),
      iosNightly: 'all',
      excluded: ['config.yaml'],
    }),
  );
  return root;
}

describe('maestro-shard-manifest sentinel', () => {
  it('exits 0 when every flow file appears in exactly one shard', () => {
    const root = setupFakeRepo({
      flows: ['a.yaml', 'b.yaml', 'c.yaml'],
      manifestFlows: [['a.yaml', 'b.yaml'], ['c.yaml']],
    });
    try {
      const r = runSentinel(root);
      expect(r.code).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('exits 1 when a flow file is missing from the manifest', () => {
    const root = setupFakeRepo({
      flows: ['a.yaml', 'b.yaml', 'unmapped.yaml'],
      manifestFlows: [['a.yaml', 'b.yaml']],
    });
    try {
      const r = runSentinel(root);
      expect(r.code).toBe(1);
      expect(r.stderr + r.stdout).toMatch(/unmapped\.yaml/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('exits 1 when a flow appears in more than one shard', () => {
    const root = setupFakeRepo({
      flows: ['a.yaml', 'b.yaml'],
      manifestFlows: [['a.yaml'], ['a.yaml', 'b.yaml']],
    });
    try {
      const r = runSentinel(root);
      expect(r.code).toBe(1);
      expect(r.stderr + r.stdout).toMatch(/duplicat/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('exits 1 when manifest references a flow that does not exist on disk', () => {
    const root = setupFakeRepo({
      flows: ['a.yaml'],
      manifestFlows: [['a.yaml', 'phantom.yaml']],
    });
    try {
      const r = runSentinel(root);
      expect(r.code).toBe(1);
      expect(r.stderr + r.stdout).toMatch(/phantom\.yaml/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
