import { execSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const JWT_RULE = 'tools/ast-grep-rules/jwt-verify-needs-algorithms.yml';
const ORDERING_RULE = 'tools/ast-grep-rules/body-keyed-rate-limit-after-validate-body.yml';
const SRC_DIR = 'museum-backend/src';
const RULES_DIR_ABS = path.join(REPO_ROOT, 'tools/ast-grep-rules');
const JWT_RULE_ABS = path.join(RULES_DIR_ABS, 'jwt-verify-needs-algorithms.yml');
const ORDERING_RULE_ABS = path.join(RULES_DIR_ABS, 'body-keyed-rate-limit-after-validate-body.yml');

interface AstGrepResult {
  file: string;
  rule: { id: string };
  range?: { start: { line: number } };
}

function runAstGrepScan(ruleFile: string, targetDir: string): AstGrepResult[] {
  try {
    const output = execSync(`ast-grep scan --rule "${ruleFile}" "${targetDir}" --json`, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const parsed: unknown = JSON.parse(output.trim() || '[]');
    return Array.isArray(parsed) ? (parsed as AstGrepResult[]) : [];
  } catch (err: unknown) {
    const execError = err as { stdout?: string; stderr?: string; status?: number };
    if (execError.stdout) {
      try {
        const parsed: unknown = JSON.parse(execError.stdout.trim() || '[]');
        return Array.isArray(parsed) ? (parsed as AstGrepResult[]) : [];
      } catch {
        return [];
      }
    }
    return [];
  }
}

describe('R4 sentinel — jwt-verify-needs-algorithms.yml', () => {
  let findings: AstGrepResult[];

  beforeAll(() => {
    findings = runAstGrepScan(JWT_RULE, SRC_DIR);
  });

  it('R4.0 — rule file exists at tools/ast-grep-rules/jwt-verify-needs-algorithms.yml', () => {
    const { existsSync } = require('node:fs') as typeof import('node:fs');
    expect(existsSync(JWT_RULE_ABS)).toBe(true);
  });

  it('R4.1 — zero jwt.verify-without-algorithms violations in museum-backend/src', () => {
    if (findings.length > 0) {
      const offenders = findings.map((f) => `${f.file}:${f.range?.start.line ?? '?'}`).join(', ');
      throw new Error(
        `jwt-verify-needs-algorithms regression: ${findings.length} violation(s): ${offenders}. ` +
          'Add explicit algorithms: [...] to the jwt.verify() options object. ' +
          'See lib-docs/jsonwebtoken/PATTERNS.md §3.',
      );
    }
    expect(findings).toHaveLength(0);
  });

  it('R4.2 — no violation in already-secured files (token-jwt.service, social-token-verifier callers)', () => {
    const alreadySecuredPatterns = ['token-jwt.service.ts'];

    for (const pattern of alreadySecuredPatterns) {
      const violationsInFile = findings.filter((f) => f.file.includes(pattern));
      expect(violationsInFile).toHaveLength(0);
    }
  });
});

describe('R8 sentinel — body-keyed-rate-limit-after-validate-body.yml', () => {
  let findings: AstGrepResult[];

  beforeAll(() => {
    findings = runAstGrepScan(ORDERING_RULE, SRC_DIR);
  });

  it('R8.0 — rule file exists at tools/ast-grep-rules/body-keyed-rate-limit-after-validate-body.yml', () => {
    const { existsSync } = require('node:fs') as typeof import('node:fs');
    expect(existsSync(ORDERING_RULE_ABS)).toBe(true);
  });

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

  it('R8.2 — auth-session.route.ts remains free of ordering violations', () => {
    const regressedTargets = findings.filter((f) => f.file.includes('auth-session.route.ts'));
    expect(regressedTargets).toHaveLength(0);
  });

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
