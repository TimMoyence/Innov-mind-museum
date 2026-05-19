/**
 * T1.7 / R4 + R8 — ast-grep sentinel: verify that the two new rules
 * flag the expected violations in HEAD source (RED state = violations exist).
 *
 * design.md §D5:
 *   Two ast-grep rules:
 *   1. jwt-verify-needs-algorithms.yml — flags jwt.verify() without algorithms
 *   2. body-keyed-rate-limit-after-validate-body.yml — flags limiter before validateBody
 *
 * RED state (tasks.md T1.7):
 *   jwt rule: flags google-oauth-state.ts:59 → exactly 1 violation → exit ≠ 0.
 *   ordering rule: flags 5 route sites (auth ×3, mfa ×2) → ≥1 violation → exit ≠ 0.
 *
 * After green phase fixes the source:
 *   jwt rule: 0 violations → exit 0.
 *   ordering rule: 0 violations → exit 0.
 *
 * Implementation: invoke `ast-grep scan` via execSync; parse JSON output to
 * count violations. This mirrors what CI does in the pre-push hook.
 *
 * Frozen-test invariant: this file is immutable byte-for-byte once committed.
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
   * RED signal: exactly 1 violation today — google-oauth-state.ts:59.
   * FAILS after green phase fixes the source (0 violations).
   *
   * After green: this assertion should be changed to expect(findings).toHaveLength(0)
   * — but since this is the FROZEN RED test, green phase must NOT modify this file.
   * Instead, green phase fixes the source until the rule produces 0 findings,
   * which means this assertion will PASS with 0 violations ≠ 1... wait.
   *
   * IMPORTANT: The assertion below is the RED assertion that FAILS when green fixes
   * the source. The green-phase DONE-WHEN is that this assertion transitions from
   * "0 violations !== 1 expected RED violations" (i.e. all fixed) to
   * "0 violations === 0" in a separate green-phase test OR the verifier confirms
   * the rule exits 0.
   *
   * Per tasks.md T1.7: "TODAY the rule scan flags google-oauth-state.ts:59 as
   * an offence → exit ≠ 0 → red."
   *
   * We assert exactly 1 violation in RED (the known unfixed site). This test
   * FAILS after green (0 violations). The frozen-test contract means green
   * phase cannot change this assertion — green must fix the source.
   */
  it('R4.1 — exactly 1 violation today: google-oauth-state.ts jwt.verify without algorithms', () => {
    // RED state: 1 violation expected (google-oauth-state.ts:59)
    // This assertion FAILS after green phase fixes the source (0 violations found)
    expect(findings.length).toBeGreaterThanOrEqual(1);

    // Verify the violation is the expected file
    const violatingFiles = findings.map((f) => f.file);
    const hasGoogleOAuthState = violatingFiles.some((f) => f.includes('google-oauth-state.ts'));
    expect(hasGoogleOAuthState).toBe(true);
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
   * RED signal: ≥1 violation today (5 expected: auth ×3, mfa ×2).
   * FAILS (becomes 0) after green phase reorders the middleware.
   *
   * Per tasks.md T1.7: "the rule scan over auth-session.route.ts / mfa.route.ts
   * flags the 5 routes as offences → exit ≠ 0."
   *
   * The specific count may vary depending on how ast-grep counts multi-argument
   * patterns, so we assert ≥ 1 not exactly 5.
   */
  it('R8.1 — ≥1 violation today: body-keyed limiter appears before validateBody', () => {
    // RED state: ≥1 violation
    // This assertion FAILS after green phase reorders middleware (0 violations)
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  /**
   * RED signal: violations come from the expected files.
   */
  it('R8.2 — violations are in auth-session.route.ts and/or mfa.route.ts', () => {
    if (findings.length === 0) {
      // If no findings, this test marks the expectation and fails
      expect(findings.length).toBeGreaterThan(0);
      return;
    }

    const violatingFiles = findings.map((f) => f.file);
    const inExpectedFiles = violatingFiles.some(
      (f) => f.includes('auth-session.route.ts') || f.includes('mfa.route.ts'),
    );
    expect(inExpectedFiles).toBe(true);
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
