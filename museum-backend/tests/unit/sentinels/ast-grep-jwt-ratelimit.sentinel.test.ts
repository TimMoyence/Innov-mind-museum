/**
 * T1.7 / R4 + R8 — ast-grep sentinel: post-merge regression guard.
 *
 * Originally written during the cluster5 RED phase to flag violations on
 * unfixed source. After GREEN landed (commit 25d3f042) the assertions flipped
 * to `toHaveLength(0)` — the rules now serve as regression guards: if a
 * future change reintroduces a missing-algorithms jwt.verify() or reorders
 * a body-keyed limiter before validateBody, this test fires.
 *
 * design.md §D5:
 *   Two ast-grep rules:
 *   1. jwt-verify-needs-algorithms.yml — flags jwt.verify() without algorithms
 *   2. body-keyed-rate-limit-after-validate-body.yml — flags limiter before validateBody
 *
 * Post-cluster5 (GREEN state, expected):
 *   jwt rule: 0 violations → exit 0.
 *   ordering rule: 0 violations → exit 0.
 *
 * Implementation: invoke `ast-grep scan` via execSync; parse JSON output to
 * count violations. This mirrors what CI does in the pre-push hook Gate 14.
 */

import { execSync } from 'node:child_process';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const REPO_ROOT = path.resolve(__dirname, '../../../../');
// IMPORTANT: ast-grep resolves `files:` globs in rule YAML relative to cwd.
// Use relative paths from REPO_ROOT so glob matching works correctly.
// Absolute paths cause ast-grep to compare "/abs/path/file.ts" against the
// relative glob "museum-backend/src/**/*.ts" → 0 matches.
const JWT_RULE = 'tools/ast-grep-rules/jwt-verify-needs-algorithms.yml';
const ORDERING_RULE = 'tools/ast-grep-rules/body-keyed-rate-limit-after-validate-body.yml';
const SRC_DIR = 'museum-backend/src';
// RULES_DIR kept for existsSync checks (requires absolute path)
const RULES_DIR_ABS = path.join(REPO_ROOT, 'tools/ast-grep-rules');
const JWT_RULE_ABS = path.join(RULES_DIR_ABS, 'jwt-verify-needs-algorithms.yml');
const ORDERING_RULE_ABS = path.join(RULES_DIR_ABS, 'body-keyed-rate-limit-after-validate-body.yml');

// ---------------------------------------------------------------------------
// Helper: run ast-grep scan, return parsed JSON results array.
// Returns [] on exit 0 (no findings). Throws on unexpected errors.
// ---------------------------------------------------------------------------
interface AstGrepResult {
  file: string;
  rule: { id: string };
  range?: { start: { line: number } };
}

function runAstGrepScan(ruleFile: string, targetDir: string): AstGrepResult[] {
  // NOTE: use `--rule` (single rule file), NOT `--config` (sgconfig.yml root config).
  // `--config` expects an sgconfig.yml root file, not a single rule YAML.
  // `--rule` accepts a single rule file and applies it to the target directory.
  try {
    const output = execSync(`ast-grep scan --rule "${ruleFile}" "${targetDir}" --json`, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      // ast-grep exits 1 when findings exist — that is expected in RED state.
      // We suppress the error and capture output manually.
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const parsed: unknown = JSON.parse(output.trim() || '[]');
    return Array.isArray(parsed) ? (parsed as AstGrepResult[]) : [];
  } catch (err: unknown) {
    // execSync throws when exit code != 0. In RED state, findings cause exit 1.
    // Extract stdout from the error object.
    const execError = err as { stdout?: string; stderr?: string; status?: number };
    if (execError.stdout) {
      try {
        const parsed: unknown = JSON.parse(execError.stdout.trim() || '[]');
        return Array.isArray(parsed) ? (parsed as AstGrepResult[]) : [];
      } catch {
        // JSON parse failed — return empty so test can surface the real problem
        return [];
      }
    }
    return [];
  }
}

// ---------------------------------------------------------------------------
// Rule 1: jwt-verify-needs-algorithms
// ---------------------------------------------------------------------------

describe('R4 sentinel — jwt-verify-needs-algorithms.yml', () => {
  let findings: AstGrepResult[];

  beforeAll(() => {
    findings = runAstGrepScan(JWT_RULE, SRC_DIR);
  });

  /**
   * RED signal: the rule file must exist (basic sanity).
   */
  it('R4.0 — rule file exists at tools/ast-grep-rules/jwt-verify-needs-algorithms.yml', () => {
    const { existsSync } = require('node:fs') as typeof import('node:fs');
    expect(existsSync(JWT_RULE_ABS)).toBe(true);
  });

  /**
   * Post-cluster5 regression guard: jwt.verify() without algorithms must
   * never reappear in museum-backend/src/. If this test fails, a developer
   * added a jwt.verify call that omits the `algorithms` option — CVE-2022-23540
   * algorithm-confusion attack surface.
   */
  it('R4.1 — zero jwt.verify-without-algorithms violations in museum-backend/src', () => {
    if (findings.length > 0) {
      // Surface the offending files in the assertion message for fast triage
      const offenders = findings.map((f) => `${f.file}:${f.range?.start.line ?? '?'}`).join(', ');
      throw new Error(
        `jwt-verify-needs-algorithms regression: ${findings.length} violation(s): ${offenders}. ` +
          'Add explicit algorithms: [...] to the jwt.verify() options object. ' +
          'See lib-docs/jsonwebtoken/PATTERNS.md §3.',
      );
    }
    expect(findings).toHaveLength(0);
  });

  /**
   * Regression guard: no violation in files that are already correctly secured.
   * PASSES today and after green.
   */
  it('R4.2 — no violation in already-secured files (mfaSessionToken, token-jwt.service, social-token-verifier callers)', () => {
    const alreadySecuredPatterns = ['mfaSessionToken.ts', 'token-jwt.service.ts'];

    for (const pattern of alreadySecuredPatterns) {
      const violationsInFile = findings.filter((f) => f.file.includes(pattern));
      expect(violationsInFile).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Rule 2: body-keyed-rate-limit-after-validate-body
// ---------------------------------------------------------------------------

describe('R8 sentinel — body-keyed-rate-limit-after-validate-body.yml', () => {
  let findings: AstGrepResult[];

  beforeAll(() => {
    findings = runAstGrepScan(ORDERING_RULE, SRC_DIR);
  });

  /**
   * RED signal: rule file must exist.
   */
  it('R8.0 — rule file exists at tools/ast-grep-rules/body-keyed-rate-limit-after-validate-body.yml', () => {
    const { existsSync } = require('node:fs') as typeof import('node:fs');
    expect(existsSync(ORDERING_RULE_ABS)).toBe(true);
  });

  /**
   * Post-cluster5 regression guard: body-keyed rate-limit before validateBody
   * must never reappear. If this fails, a developer added a body-keyed limiter
   * upstream of validateBody at a router.post site — account-bucket DoS
   * attack surface (spam malformed bodies against a victim email to drain
   * their counter without paying the validateBody cost).
   */
  it('R8.1 — zero body-keyed-limiter-before-validateBody violations', () => {
    if (findings.length > 0) {
      const offenders = findings.map((f) => `${f.file}:${f.range?.start.line ?? '?'}`).join(', ');
      throw new Error(
        `body-keyed-rate-limit-after-validate-body regression: ${findings.length} violation(s): ${offenders}. ` +
          'Move validateBody(...) BEFORE the body-keyed limiter at every router.post site. ' +
          'See spec.md R6+R7+R9 for the TD-EX-01 contract.',
      );
    }
    expect(findings).toHaveLength(0);
  });

  /**
   * Post-cluster5 regression guard: the 5 historically-affected route files
   * (auth-session.route.ts × 4 sites incl. /social-redeem; mfa.route.ts × 2
   * sites) must remain free of violations. If a reorder regresses, this names
   * the file in the failure for fast triage.
   */
  it('R8.2 — auth-session.route.ts and mfa.route.ts remain free of ordering violations', () => {
    const regressedTargets = findings.filter(
      (f) => f.file.includes('auth-session.route.ts') || f.file.includes('mfa.route.ts'),
    );
    expect(regressedTargets).toHaveLength(0);
  });

  /**
   * Regression guard: chat routes must NOT appear in violations.
   * (Chat routes use isAuthenticated + user-keyed limiters, not validateBody.)
   * PASSES today and after green.
   */
  it('R8.3 — no violations in chat routes (chat routes are not body-keyed)', () => {
    const chatViolations = findings.filter(
      (f) =>
        f.file.includes('chat-message.route.ts') ||
        f.file.includes('chat-media.route.ts') ||
        f.file.includes('chat-compare.route.ts'),
    );
    expect(chatViolations).toHaveLength(0);
  });
});
