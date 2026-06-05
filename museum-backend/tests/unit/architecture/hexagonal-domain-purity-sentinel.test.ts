/**
 * RED phase — driver for the independent hexagonal domain-purity sentinel
 * (run 2026-06-04-hexagonal-boundaries-enforcement, T1.2; spec R3 / R8 +
 * Independence NFR; design.md §9).
 *
 * The sentinel under test is `scripts/sentinels/hexagonal-domain-purity.mjs`: a
 * filesystem walk (NO lint-config/plugin import — defense-in-depth backstop that
 * survives a future re-regression of the lint config) that FAILs if any
 * `src/modules/<m>/domain/**` file imports a module resolving into another layer
 * (`/adapters/`, `/useCase/`, `/application/`, `/infrastructure/`, `@data/`, …).
 *
 * This driver exercises it two ways:
 *   1. REAL tree — runs the sentinel with no root override; asserts it exits 0
 *      (a CLEAN domain layer). It does NOT today: the still-present ARCH-02 leak
 *      (`chat-orchestrator.port.ts:9` → useCase) makes the sentinel exit 1 with a
 *      non-empty offender list. So THIS assertion FAILS today (RED) and turns
 *      GREEN once T1.4 relocates `KnowledgeRouterSource` into the domain layer.
 *      That non-zero `pnpm test` exit IS the success of this RED phase.
 *   2. INJECTED leak — points the sentinel at a temp module tree whose `domain/`
 *      file imports a secondary adapter; asserts it exits 1 with a non-empty,
 *      sorted offender list naming file:line (proves the sentinel actually
 *      detects leaks, not just that it returns []).
 *   3. INDEPENDENCE — asserts the sentinel source contains no lint-tooling import
 *      (`from 'eslint'` / `eslint.config`), per the Independence NFR.
 *
 * Frozen-test discipline (UFR-022): sha256-hashed in red-test-manifest.json; the
 * green phase MUST NOT modify it byte-for-byte. Suspected bug → emit
 * `BLOCK-TEST-WRONG <file>:<line> <reason>` and STOP.
 *
 * Spec sources of truth:
 *   .claude/skills/team/team-state/2026-06-04-hexagonal-boundaries-enforcement/spec.md §3 R3 / §9.4
 *   .claude/skills/team/team-state/2026-06-04-hexagonal-boundaries-enforcement/design.md §9
 *   .claude/skills/team/team-state/2026-06-04-hexagonal-boundaries-enforcement/tasks.md T1.2
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// tests/unit/architecture → museum-backend
const BACKEND_ROOT = resolve(__dirname, '../../..');
const SENTINEL = resolve(BACKEND_ROOT, 'scripts/sentinels/hexagonal-domain-purity.mjs');

interface SentinelRun {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Runs the sentinel, optionally against a temp scan root via the
 * `HEXAGONAL_DOMAIN_PURITY_ROOT` override. Captures exit code + streams (a
 * non-zero exit is data here, not a thrown failure). A missing sentinel surfaces
 * as a non-zero exit too.
 * @param root - optional scan-root override (defaults to the real src/modules)
 * @returns the captured exit code and output streams
 */
function runSentinel(root?: string): SentinelRun {
  try {
    const stdout = execFileSync('node', [SENTINEL], {
      cwd: BACKEND_ROOT,
      encoding: 'utf8',
      env:
        root === undefined ? process.env : { ...process.env, HEXAGONAL_DOMAIN_PURITY_ROOT: root },
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

describe('hexagonal domain-purity sentinel (R3 / R8 / Independence)', () => {
  it('exits 0 with no offenders on the real domain tree (clean layering)', () => {
    const run = runSentinel();
    // GREEN target: clean tree → exit 0. RED today: ARCH-02 leak → exit 1.
    expect(run.code).toBe(0);
  });

  it('exits 1 with a non-empty sorted offender list on an injected domain→adapter leak', () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'hexagonal-purity-'));
    try {
      // Synthetic module tree: <root>/_leak/domain/leak.ts imports a secondary adapter.
      const domainDir = join(tmpRoot, '_leak', 'domain');
      mkdirSync(domainDir, { recursive: true });
      writeFileSync(
        join(domainDir, 'leak.ts'),
        "import type { Foo } from '@modules/chat/adapters/secondary/llm/langchain.orchestrator';\nexport type Bar = Foo;\n",
        'utf8',
      );

      const run = runSentinel(tmpRoot);
      expect(run.code).toBe(1);
      const offenderLines = run.stderr.split('\n').filter((l) => l.includes('-> '));
      expect(offenderLines.length).toBeGreaterThanOrEqual(1);
      expect(run.stderr).toContain('_leak/domain/leak.ts:1');
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('contains no lint-tooling import (Independence NFR)', () => {
    const source = readFileSync(SENTINEL, 'utf8');
    expect(source).not.toMatch(/from\s+['"]eslint['"]/);
    expect(source).not.toMatch(/eslint\.config/);
  });
});
