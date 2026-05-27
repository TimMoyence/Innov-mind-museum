/**
 * A11Y-02 / C11 — canonical-domain sentinel test.
 *
 * The owned domain is musaium.com; musaium.app is not owned. The sentinel must
 * flag musaium.app anywhere in application source (backend UA strings, frontend
 * i18n, web surfaces) but must NOT flag test files that assert its absence.
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
  'scripts',
  'sentinels',
  'web-domain-canonical.mjs',
);

function run(root: string): number {
  try {
    execFileSync('node', [SENTINEL, '--root', root], { encoding: 'utf-8' });
    return 0;
  } catch (err) {
    return (err as { status?: number }).status ?? 1;
  }
}

function fakeRepo(write: (root: string) => void): string {
  const root = mkdtempSync(join(tmpdir(), 'domain-canonical-'));
  write(root);
  return root;
}

describe('canonical-domain sentinel (no musaium.app)', () => {
  it('fails (exit 1) when musaium.app appears in backend source', () => {
    const root = fakeRepo((r) => {
      const dir = join(r, 'museum-backend', 'src');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'client.ts'), "const ua = 'Musaium/1.0 (https://musaium.app)';\n");
    });
    try {
      expect(run(root)).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails (exit 1) when musaium.app appears in a frontend i18n file', () => {
    const root = fakeRepo((r) => {
      const dir = join(r, 'museum-frontend', 'shared', 'locales', 'en');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'translation.json'), '{ "share": "https://musaium.app" }\n');
    });
    try {
      expect(run(root)).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('passes (exit 0) when only the owned domain musaium.com is used', () => {
    const root = fakeRepo((r) => {
      const dir = join(r, 'museum-backend', 'src');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'client.ts'), "const ua = 'Musaium/1.0 (https://musaium.com)';\n");
    });
    try {
      expect(run(root)).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does NOT flag a test file that references musaium.app to assert its absence', () => {
    const root = fakeRepo((r) => {
      const dir = join(r, 'museum-web', 'src');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'x.test.ts'), "expect(s).not.toContain('musaium.app');\n");
    });
    try {
      expect(run(root)).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
