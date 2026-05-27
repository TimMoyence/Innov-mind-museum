/**
 * HON-08 — doc-last-verified sentinel test.
 *
 * Drives the sidecar-manifest sentinel against synthesized fixtures: a fresh
 * stamp passes, a >90d stamp fails, a missing doc fails. Deterministic via
 * `--today` + a fixture `--manifest`.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const SENTINEL = resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'scripts',
  'sentinels',
  'doc-last-verified.mjs',
);
const TODAY = '2026-05-27';

function run(root: string, manifest: string): number {
  try {
    execFileSync('node', [SENTINEL, '--root', root, '--manifest', manifest, '--today', TODAY], {
      encoding: 'utf-8',
    });
    return 0;
  } catch (err) {
    return (err as { status?: number }).status ?? 1;
  }
}

/** Build a fixture repo with a doc on disk + a manifest stamping it `date`. */
function fixture(opts: { docOnDisk: boolean; date: string }): { root: string; manifest: string } {
  const root = mkdtempSync(join(tmpdir(), 'doc-lastverified-'));
  const docsDir = join(root, 'docs');
  mkdirSync(docsDir, { recursive: true });
  if (opts.docOnDisk) writeFileSync(join(docsDir, 'CANON.md'), '# Canonical doc\n\nclaims here.\n');
  const manifest = join(root, 'manifest.json');
  writeFileSync(manifest, JSON.stringify({ docs: { 'docs/CANON.md': opts.date } }));
  return { root, manifest };
}

describe('doc-last-verified sentinel (HON-08)', () => {
  it('passes (exit 0) when the stamp is today', () => {
    const { root, manifest } = fixture({ docOnDisk: true, date: TODAY });
    try {
      expect(run(root, manifest)).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('passes (exit 0) when the stamp is within the 90-day window (87d)', () => {
    const { root, manifest } = fixture({ docOnDisk: true, date: '2026-03-01' }); // 87d before TODAY
    try {
      expect(run(root, manifest)).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails (exit 1) when the stamp is older than 90 days (146d)', () => {
    const { root, manifest } = fixture({ docOnDisk: true, date: '2026-01-01' }); // 146d before TODAY
    try {
      expect(run(root, manifest)).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails (exit 1) when a manifest-listed doc is missing on disk', () => {
    const { root, manifest } = fixture({ docOnDisk: false, date: TODAY });
    try {
      expect(run(root, manifest)).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
