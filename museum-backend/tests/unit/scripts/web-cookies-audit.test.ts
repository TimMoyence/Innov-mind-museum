/**
 * T2.2 / R18 — web-cookies-audit sentinel (RED phase, UFR-022).
 *
 * The sentinel `museum-backend/scripts/sentinels/web-cookies-audit.mjs` scans
 * `museum-web/package.json` (deps), `instrumentation-client.ts`,
 * `sentry.*.config.ts`, `app/layout.tsx` for any forbidden non-essential-
 * cookie-setting SDK: @vercel/analytics, @sentry/replay, posthog, amplitude,
 * gtag, google-analytics, hotjar, matomo, plausible, umami, fathom, segment,
 * mixpanel. Also flags a numeric `replaysSessionSampleRate` in Sentry config.
 *
 * Positive: current `museum-web` deps clean → exit 0.
 * Negative: inject `@vercel/analytics` → exit ≠ 0 + names the dep.
 *
 * Pre-impl state (RED): script does not exist → ENOENT non-zero exit.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const SENTINEL = path.join(REPO_ROOT, 'museum-backend/scripts/sentinels/web-cookies-audit.mjs');

interface PkgJson {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/**
 * Build a museum-web mirror under fixturesDir with a clean (non-forbidden)
 * package.json + minimal config files the sentinel scans.
 */
function buildCleanFixture(root: string): void {
  mkdirSync(path.join(root, 'museum-web/src/app'), { recursive: true });
  const pkg: PkgJson = {
    name: 'museum-web',
    dependencies: {
      '@sentry/nextjs': '^10.49.0',
      next: '^15.5.18',
      react: '^19.2.0',
    },
    devDependencies: {
      vitest: '^4.1.4',
    },
  };
  writeFileSync(path.join(root, 'museum-web/package.json'), JSON.stringify(pkg, null, 2), 'utf8');
  writeFileSync(
    path.join(root, 'museum-web/instrumentation-client.ts'),
    "import * as Sentry from '@sentry/nextjs';\nSentry.init({ dsn: 'https://example/0' });\n",
    'utf8',
  );
  writeFileSync(
    path.join(root, 'museum-web/sentry.server.config.ts'),
    "import * as Sentry from '@sentry/nextjs';\nSentry.init({ dsn: 'https://example/0' });\n",
    'utf8',
  );
  writeFileSync(
    path.join(root, 'museum-web/src/app/layout.tsx'),
    'export default function Root({ children }: { children: React.ReactNode }) { return children; }\n',
    'utf8',
  );
}

function runSentinel(root: string): { exitCode: number | null; stdout: string; stderr: string } {
  const res = spawnSync('node', [SENTINEL, '--root', root], {
    encoding: 'utf8',
    timeout: 15_000,
  });
  return {
    exitCode: res.status,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
  };
}

describe('T2.2 / R18 — web-cookies-audit sentinel', () => {
  let fixturesDir: string;

  beforeEach(() => {
    fixturesDir = mkdtempSync(path.join(tmpdir(), 'web-cookies-audit-'));
    buildCleanFixture(fixturesDir);
  });

  afterEach(() => {
    rmSync(fixturesDir, { recursive: true, force: true });
  });

  describe('positive — clean museum-web', () => {
    it('exits 0 when no forbidden SDK is present', () => {
      const result = runSentinel(fixturesDir);
      expect(result.exitCode).toBe(0);
    });
  });

  describe('negative — @vercel/analytics injection', () => {
    it('exits ≠ 0 and names "@vercel/analytics" when injected into package.json deps', () => {
      const pkgPath = path.join(fixturesDir, 'museum-web/package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as PkgJson;
      pkg.dependencies = { ...pkg.dependencies, '@vercel/analytics': '^1.0.0' };
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');

      const result = runSentinel(fixturesDir);
      expect(result.exitCode).not.toBe(0);
      const output = `${result.stdout}\n${result.stderr}`;
      expect(output).toMatch(/@vercel\/analytics/);
    });
  });

  describe('negative — posthog injection in devDependencies', () => {
    it('exits ≠ 0 and names "posthog" when posthog appears anywhere in deps', () => {
      const pkgPath = path.join(fixturesDir, 'museum-web/package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as PkgJson;
      pkg.devDependencies = { ...pkg.devDependencies, 'posthog-js': '^1.0.0' };
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');

      const result = runSentinel(fixturesDir);
      expect(result.exitCode).not.toBe(0);
      const output = `${result.stdout}\n${result.stderr}`;
      expect(output).toMatch(/posthog/i);
    });
  });

  describe('negative — replaysSessionSampleRate numeric value', () => {
    it('exits ≠ 0 when Sentry config sets replaysSessionSampleRate to a non-zero number', () => {
      const cfgPath = path.join(fixturesDir, 'museum-web/sentry.server.config.ts');
      const before = readFileSync(cfgPath, 'utf8');
      const mutated = before.replace(
        "dsn: 'https://example/0'",
        "dsn: 'https://example/0', replaysSessionSampleRate: 0.1",
      );
      writeFileSync(cfgPath, mutated, 'utf8');

      const result = runSentinel(fixturesDir);
      expect(result.exitCode).not.toBe(0);
      const output = `${result.stdout}\n${result.stderr}`;
      expect(output).toMatch(/replaysSessionSampleRate/);
    });
  });

  it('emits a "## Sentinel report" block on failure', () => {
    const pkgPath = path.join(fixturesDir, 'museum-web/package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as PkgJson;
    pkg.dependencies = { ...pkg.dependencies, '@vercel/analytics': '^1.0.0' };
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');

    const result = runSentinel(fixturesDir);
    expect(result.exitCode).not.toBe(0);
    const output = `${result.stdout}\n${result.stderr}`;
    expect(output).toMatch(/##\s*Sentinel\s+report/i);
  });
});
