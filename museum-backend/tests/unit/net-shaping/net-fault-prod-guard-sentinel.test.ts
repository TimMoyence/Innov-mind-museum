/**
 * W2-09 (RED) — net-fault prod-guard sentinel self-test (spawn the real script).
 *
 * spec.md §EARS R8 + design.md §Architecture: the sentinel
 * `scripts/sentinels/net-fault-prod-guard.mjs` (created in W2-10) asserts the
 * D3 prod-refusal invariants and is wired into `pnpm lint` + sentinel-mirror
 * (UFR-020 anti-bypass). It MUST:
 *   - exit 0 when the tree is clean;
 *   - exit 1 + non-empty stderr when ANY guard regresses:
 *       (a) a `.env*` file sets NET_FAULT_INJECTION_ENABLED truthy,
 *       (b) the app.ts mount is not conditional on a non-production guard,
 *       (c) the validateProductionEnv boot-throw is missing,
 *       (d) the reset route is registered unconditionally (ungated),
 *       (e) the middleware source contains a prod escape-hatch token.
 *
 * The sentinel accepts path overrides via env so this self-test can point it at
 * temp fixtures WITHOUT mutating the real tree (mirrors the parity sentinel's
 * `NET_PROFILES_BE_PATH` override precedent):
 *   - NET_FAULT_ENV_GLOB_DIR   → directory scanned for `.env*` files
 *   - NET_FAULT_APP_TS         → app.ts path (mount + reset-route scan)
 *   - NET_FAULT_VALIDATION_TS  → env.production-validation.ts path (boot-throw scan)
 *   - NET_FAULT_MIDDLEWARE_TS  → middleware path (escape-hatch token scan)
 *
 * RED state: the sentinel script does not exist yet → `node <missing-file>`
 * errors (non-zero) for the "clean tree" case too → assertions fail.
 *
 * lib-docs: none (node:child_process / node:fs / node:os / node:path — stdlib).
 * No inline test entities — fixtures are plain source-string files on disk.
 *
 * Frozen-test invariant: byte-immutable once manifested (phase=green).
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// __dirname = museum-backend/tests/unit/net-shaping → backend root is three up,
// repo root is four up. The sentinel lives under museum-backend/scripts.
const BACKEND_ROOT = join(__dirname, '..', '..', '..');
const SENTINEL = join(BACKEND_ROOT, 'scripts', 'sentinels', 'net-fault-prod-guard.mjs');

/** A tree of fixture files that all guards PASS (clean baseline). */
function writeCleanFixtures(): {
  envDir: string;
  appTs: string;
  validationTs: string;
  middlewareTs: string;
} {
  const dir = mkdtempSync(join(tmpdir(), 'net-fault-guard-'));

  const envDir = join(dir, 'env');
  mkdirSync(envDir, { recursive: true });
  // A clean .env that documents the flag but does NOT enable it.
  writeFileSync(join(envDir, '.env.example'), 'NET_FAULT_INJECTION_ENABLED=false\n', 'utf8');

  const appTs = join(dir, 'app.ts');
  writeFileSync(
    appTs,
    [
      "import { shouldMountNetFault } from '@src/config/net-fault.config';",
      'function applyGlobalMiddleware(app) {',
      '  if (shouldMountNetFault(process.env.NET_FAULT_INJECTION_ENABLED, env.nodeEnv)) {',
      '    app.use(netProfileFaultMiddleware);',
      "    app.post('/api/__test__/net-fault/reset', resetHandler);",
      '  }',
      '}',
    ].join('\n'),
    'utf8',
  );

  const validationTs = join(dir, 'env.production-validation.ts');
  writeFileSync(
    validationTs,
    [
      'export function validateProductionEnv(env) {',
      '  if (toBoolean(process.env.NET_FAULT_INJECTION_ENABLED, false)) {',
      "    throw new Error('NET_FAULT_INJECTION_ENABLED is forbidden in production.');",
      '  }',
      '}',
    ].join('\n'),
    'utf8',
  );

  const middlewareTs = join(dir, 'net-profile-fault.middleware.ts');
  writeFileSync(
    middlewareTs,
    [
      '// TEST-ONLY fault injector. NO production escape hatch (D3).',
      'export function createNetProfileFaultMiddleware() {',
      '  return (req, res, next) => next();',
      '}',
    ].join('\n'),
    'utf8',
  );

  return { envDir, appTs, validationTs, middlewareTs };
}

function runSentinel(overrides: NodeJS.ProcessEnv) {
  return spawnSync('node', [SENTINEL], {
    cwd: BACKEND_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...overrides },
  });
}

function envFor(f: ReturnType<typeof writeCleanFixtures>): NodeJS.ProcessEnv {
  return {
    NET_FAULT_ENV_GLOB_DIR: f.envDir,
    NET_FAULT_APP_TS: f.appTs,
    NET_FAULT_VALIDATION_TS: f.validationTs,
    NET_FAULT_MIDDLEWARE_TS: f.middlewareTs,
  };
}

describe('net-fault prod-guard sentinel self-test (W2-09)', () => {
  it('exits 0 when the tree is clean (all D3 guards hold)', () => {
    const f = writeCleanFixtures();
    const result = runSentinel(envFor(f));
    expect(result.status).toBe(0);
  });

  it('exits 1 when a .env* file ENABLES NET_FAULT_INJECTION_ENABLED', () => {
    const f = writeCleanFixtures();
    writeFileSync(join(f.envDir, '.env.local'), 'NET_FAULT_INJECTION_ENABLED=true\n', 'utf8');
    const result = runSentinel(envFor(f));
    expect(result.status).toBe(1);
    expect((result.stderr ?? '').trim().length).toBeGreaterThan(0);
  });

  it('exits 1 when the app.ts mount is NOT conditional (unconditional app.use)', () => {
    const f = writeCleanFixtures();
    writeFileSync(
      f.appTs,
      [
        'function applyGlobalMiddleware(app) {',
        '  app.use(netProfileFaultMiddleware);', // no shouldMountNetFault guard
        "  app.post('/api/__test__/net-fault/reset', resetHandler);",
        '}',
      ].join('\n'),
      'utf8',
    );
    const result = runSentinel(envFor(f));
    expect(result.status).toBe(1);
    expect((result.stderr ?? '').trim().length).toBeGreaterThan(0);
  });

  it('exits 1 when the validateProductionEnv boot-throw is MISSING', () => {
    const f = writeCleanFixtures();
    writeFileSync(
      f.validationTs,
      ['export function validateProductionEnv(env) {', '  // boot-throw removed', '}'].join('\n'),
      'utf8',
    );
    const result = runSentinel(envFor(f));
    expect(result.status).toBe(1);
    expect((result.stderr ?? '').trim().length).toBeGreaterThan(0);
  });

  it('exits 1 when the reset route is registered UNGATED (outside the mount guard)', () => {
    const f = writeCleanFixtures();
    writeFileSync(
      f.appTs,
      [
        "import { shouldMountNetFault } from '@src/config/net-fault.config';",
        'function applyGlobalMiddleware(app) {',
        '  if (shouldMountNetFault(process.env.NET_FAULT_INJECTION_ENABLED, env.nodeEnv)) {',
        '    app.use(netProfileFaultMiddleware);',
        '  }',
        // reset route registered unconditionally, OUTSIDE the guard block.
        "  app.post('/api/__test__/net-fault/reset', resetHandler);",
        '}',
      ].join('\n'),
      'utf8',
    );
    const result = runSentinel(envFor(f));
    expect(result.status).toBe(1);
    expect((result.stderr ?? '').trim().length).toBeGreaterThan(0);
  });

  it('exits 1 when the middleware source contains a prod escape-hatch token', () => {
    const f = writeCleanFixtures();
    writeFileSync(
      f.middlewareTs,
      [
        "const ESCAPE = 'I-know-what-I-am-doing';",
        'export function createNetProfileFaultMiddleware() {',
        '  return (req, res, next) => next();',
        '}',
      ].join('\n'),
      'utf8',
    );
    const result = runSentinel(envFor(f));
    expect(result.status).toBe(1);
    expect((result.stderr ?? '').trim().length).toBeGreaterThan(0);
  });

  it('the sentinel script will exist at the canonical path (W2-10)', () => {
    // Documents the expected location; RED until W2-10 creates it.
    expect(existsSync(SENTINEL)).toBe(true);
  });
});
