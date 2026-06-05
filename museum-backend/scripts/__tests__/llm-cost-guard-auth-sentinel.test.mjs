/**
 * W1-C5 RED — sentinel guarding against a *.route.ts that mounts `llmCostGuard`
 * without `isAuthenticated` upstream in the same mount call.
 * Run: 2026-05-26-kr-domains · design.md §W1-C5 / AC-C5.1..C5.3.
 *
 * The anonymous bypass in `llmCostGuard` is intentional and LOUD (warn +
 * `llm_cost_anon_bypass_total`, #300). This sentinel does NOT remove it — it
 * prevents a FUTURE route from structurally mounting the paid-call cost guard
 * with no authentication gate (the anon path then never carries a stable
 * per-user key → the cap is silently un-enforceable for that route).
 *
 * Detection (per design.md §W1-C5): scan `*.route.ts` under the scan root for
 * `router.<verb>(...)` mount calls that reference `llmCostGuard`; each such call
 * MUST also reference `isAuthenticated` upstream. The scan root is overridable
 * via `LLM_COST_GUARD_AUTH_ROOT` (mirrors `STRYKER_GATE_ROOT`) so this test can
 * point it at a temp fixture dir.
 *
 * Mirrors `stryker-hot-files-gate.test.mjs` (mkdtempSync + execFileSync + env
 * root override + exit-code assertions).
 *
 * RED failure mode at be758ab56: `scripts/sentinels/llm-cost-guard-auth.mjs`
 * does NOT exist, so `execFileSync('node', [SCRIPT])` fails to resolve the module
 * → non-zero exit (≠ 0) for EVERY case below, including the "conforme" / exit-0
 * expectations → those assertions FAIL. Counts as RED (design.md §6 / AC-C5).
 *
 * Frozen-test discipline (UFR-022): this file is sha256-hashed in
 * red-test-manifest.json. Green phase MUST NOT modify it.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const SCRIPT = resolve(process.cwd(), 'scripts/sentinels/llm-cost-guard-auth.mjs');
const REAL_SRC = resolve(process.cwd(), 'src');

/** Standard import line the sentinel keys on to avoid false positives in comments. */
const IMPORT_LINE = "import { llmCostGuard } from '@shared/middleware/llm-cost-guard.middleware';";
const AUTH_IMPORT_LINE =
  "import { isAuthenticated } from '@shared/middleware/authenticated.middleware';";

let workDir;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'llm-cost-auth-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/**
 * Runs the sentinel against `root` (default = the temp workDir) and captures the
 * exit code + streams. A missing script (RED) surfaces as a non-zero exit too.
 * @param root
 */
function runScript(root = workDir) {
  try {
    const stdout = execFileSync('node', [SCRIPT], {
      env: { ...process.env, LLM_COST_GUARD_AUTH_ROOT: root },
      encoding: 'utf-8',
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      code: err.status ?? 1,
      stdout: err.stdout?.toString() ?? '',
      stderr: err.stderr?.toString() ?? '',
    };
  }
}

/**
 * Writes a fixture route file under the temp scan root.
 * @param relPath
 * @param contents
 */
function writeRoute(relPath, contents) {
  const full = join(workDir, relPath);
  mkdirSync(resolve(full, '..'), { recursive: true });
  writeFileSync(full, contents);
}

describe('llm-cost-guard-auth sentinel', () => {
  it('exits 1 when a route mounts llmCostGuard WITHOUT isAuthenticated (violation)', () => {
    writeRoute(
      'chat-bad.route.ts',
      `${IMPORT_LINE}\n` +
        `export function register(router) {\n` +
        `  router.post('/pay', llmCostGuard, (_req, res) => res.json({ ok: true }));\n` +
        `}\n`,
    );
    const r = runScript();
    expect(r.code).toBe(1);
    expect(r.stderr + r.stdout).toMatch(/chat-bad\.route\.ts/);
  });

  it('exits 0 when llmCostGuard is mounted WITH isAuthenticated upstream (conformant)', () => {
    writeRoute(
      'chat-good.route.ts',
      `${AUTH_IMPORT_LINE}\n${IMPORT_LINE}\n` +
        `export function register(router) {\n` +
        `  router.post('/pay', isAuthenticated, llmCostGuard, (_req, res) => res.json({ ok: true }));\n` +
        `}\n`,
    );
    const r = runScript();
    expect(r.code).toBe(0);
  });

  it('exits 0 for a route that does NOT mount llmCostGuard (nothing to check)', () => {
    writeRoute(
      'chat-free.route.ts',
      `${AUTH_IMPORT_LINE}\n` +
        `export function register(router) {\n` +
        `  router.get('/free', isAuthenticated, (_req, res) => res.json({ ok: true }));\n` +
        `}\n`,
    );
    const r = runScript();
    expect(r.code).toBe(0);
  });

  it('exits 0 against the real src/ (today every paid route is authenticated)', () => {
    const r = runScript(REAL_SRC);
    expect(r.code).toBe(0);
  });
});
