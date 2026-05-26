/**
 * W1-C5 RED-EXT — edge case for the paid-route auth sentinel
 * (run 2026-05-26-kr-domains, corrective loop #1 after wave1-code-review.json
 * LOW finding on llm-cost-guard-auth.mjs:89-128).
 *
 * The reviewer flagged that `authUpstreamOfCostGuard()` uses `args.indexOf(AUTH_ID)`
 * on the RAW mount-call ARGUMENT text, with no comment-stripping. A mount call
 * whose ONLY `isAuthenticated` occurrence is inside a comment WITHIN the args
 * (and NOT a real middleware in the chain) therefore passes the gate — a FALSE
 * NEGATIVE: the anon path then carries no stable per-user key and the per-user
 * daily cap is silently un-enforceable for that route, which is exactly what this
 * sentinel exists to prevent.
 *
 * Scope note: a comment on a line OUTSIDE the mount-call parens is already handled
 * correctly (it is not part of the extracted arg text), so only IN-ARGS comments
 * are the gap. These NEW cases pin the desired behaviour: an `isAuthenticated`
 * appearing ONLY inside an in-args comment — block `/* … *​/` or a line `//` in a
 * multi-line mount call — must NOT satisfy the auth gate → exit 1.
 *
 * Mirrors the existing `llm-cost-guard-auth-sentinel.test.mjs` (mkdtempSync +
 * execFileSync + `LLM_COST_GUARD_AUTH_ROOT` override + exit-code assertions).
 *
 * RED failure mode at current HEAD: the sentinel matches `isAuthenticated` inside
 * the comment via `indexOf` (no comment stripping) → it considers the route gated
 * → exit 0. The `expect(r.code).toBe(1)` assertions therefore FAIL. Counts as RED.
 *
 * Frozen-test discipline (UFR-022): this file is sha256-hashed in
 * red-test-manifest.json. Green phase MUST NOT modify it byte-for-byte.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const SCRIPT = resolve(process.cwd(), 'scripts/sentinels/llm-cost-guard-auth.mjs');

/** Import line the sentinel keys on to confirm the cost-guard identifier is real. */
const IMPORT_LINE = "import { llmCostGuard } from '@shared/middleware/llm-cost-guard.middleware';";

let workDir;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'llm-cost-auth-edge-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/**
 * Runs the sentinel against `root` (default = temp workDir), capturing exit code +
 * streams. A missing script surfaces as a non-zero exit too.
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

describe('llm-cost-guard-auth sentinel — comment-only isAuthenticated edge', () => {
  it('exits 1 when the only isAuthenticated is in a LINE comment INSIDE the mount args (multi-line call)', () => {
    writeRoute(
      'chat-line-comment.route.ts',
      `${IMPORT_LINE}\n` +
        `export function register(router) {\n` +
        `  router.post(\n` +
        `    '/pay',\n` +
        `    // isAuthenticated, removed temporarily — TODO restore\n` +
        `    llmCostGuard,\n` +
        `    (_req, res) => res.json({ ok: true }),\n` +
        `  );\n` +
        `}\n`,
    );
    const r = runScript();
    expect(r.code).toBe(1);
    expect(r.stderr + r.stdout).toMatch(/chat-line-comment\.route\.ts/);
  });

  it('exits 1 when the only isAuthenticated is in a BLOCK comment inside the mount args', () => {
    writeRoute(
      'chat-block-comment.route.ts',
      `${IMPORT_LINE}\n` +
        `export function register(router) {\n` +
        `  router.post('/pay', /* isAuthenticated, */ llmCostGuard, (_req, res) => res.json({ ok: true }));\n` +
        `}\n`,
    );
    const r = runScript();
    expect(r.code).toBe(1);
    expect(r.stderr + r.stdout).toMatch(/chat-block-comment\.route\.ts/);
  });
});
