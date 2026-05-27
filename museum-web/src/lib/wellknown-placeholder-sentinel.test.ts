import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

// Root sentinel under test (deploy gate). museum-web vitest runs with cwd =
// museum-web (locally and in ci-cd-web.yml quality job working-directory), so
// the repo root is one level up.
const SENTINEL = resolve(process.cwd(), '..', 'scripts', 'sentinels', 'wellknown-placeholder-free.mjs');

function runAgainst(dir: string): { code: number; stderr: string } {
  try {
    execFileSync('node', [SENTINEL, '--dir', dir], { encoding: 'utf-8' });
    return { code: 0, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stderr?: Buffer | string };
    return { code: e.status ?? 1, stderr: e.stderr?.toString() ?? '' };
  }
}

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'wellknown-sentinel-'));
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, name), body);
  }
  return dir;
}

describe('wellknown-placeholder-free sentinel (PGP deploy gate)', () => {
  it('passes (exit 0) when no placeholder marker is present', () => {
    const dir = fixture({
      'pgp-key.txt':
        '-----BEGIN PGP PUBLIC KEY BLOCK-----\nmDMEZ...realkeybytes...AB\n-----END PGP PUBLIC KEY BLOCK-----\n',
      'security.txt': 'Contact: mailto:security@musaium.com\n',
    });
    try {
      expect(runAgainst(dir).code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails (exit 1) when the PGP placeholder token is present', () => {
    const dir = fixture({
      'pgp-key.txt':
        '-----BEGIN PGP PUBLIC KEY BLOCK-----\nPGP_KEY_PLACEHOLDER_DO_NOT_SHIP\n-----END PGP PUBLIC KEY BLOCK-----\n',
    });
    try {
      const res = runAgainst(dir);
      expect(res.code).toBe(1);
      expect(res.stderr).toContain('pgp-key.txt');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails (exit 1) when any DO_NOT_SHIP marker leaks into a .well-known file', () => {
    const dir = fixture({ 'assetlinks.json': '{ "note": "TODO_DO_NOT_SHIP stub" }\n' });
    try {
      expect(runAgainst(dir).code).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails (exit 1) when the target directory does not exist', () => {
    expect(runAgainst(join(tmpdir(), 'definitely-missing-wellknown-xyz')).code).toBe(1);
  });
});
