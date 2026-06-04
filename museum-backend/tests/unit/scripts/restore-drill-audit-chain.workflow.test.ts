/**
 * RED — TD-27: the monthly restore drill must verify the audit_logs hash chain
 * post-restore, not just `count(*)` smoke the tables.
 *
 * `.github/workflows/db-backup-monthly-restore-drill.yml` today restores the
 * latest encrypted backup into an ephemeral postgres and asserts row counts
 * (`users`, `chat_sessions`, `audit_logs`). It NEVER proves the restored
 * audit chain is intact — a tampered or torn chain in the backup would pass the
 * drill silently. SOC2 CC7.3 / NIST RC.RP-1 want integrity validation, not just
 * "rows exist".
 *
 * The fix wires the EXISTING canonical verifier (`pnpm audit-chain:verify`,
 * which runs `scripts/audit-chain-verify.ts` via ts-node) into the drill —
 * deliberately NOT a hand-rolled `.cjs` re-implementation of the SHA-256
 * serializer (which would silently drift from `audit-chain.ts` v1/v2 and risk a
 * false-INTACT verdict on a real break).
 *
 * The verify step MUST run AFTER pg_restore (needs the data) and BEFORE the
 * smoke queries (chain integrity is the deeper assertion; a torn chain should
 * fail the drill regardless of row counts).
 *
 * No `actionlint` in repo (verified, see ci-cd-backend-smoke-lifecycle.workflow.test.ts)
 * → a text/parse assertion in Jest is the verification.
 *
 * Run scope:
 *   pnpm jest tests/unit/scripts/restore-drill-audit-chain.workflow.test.ts
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const WORKFLOW_PATH = path.resolve(
  __dirname,
  '../../../../.github/workflows/db-backup-monthly-restore-drill.yml',
);

const workflow = readFileSync(WORKFLOW_PATH, 'utf8');

/**
 * Index of the first line whose text includes `needle`, or -1.
 * @param haystack
 * @param needle
 */
const lineIndexOf = (haystack: string, needle: string): number =>
  haystack.split('\n').findIndex((line) => line.includes(needle));

describe('db-backup-monthly-restore-drill.yml — audit-chain integrity (TD-27)', () => {
  it('invokes the canonical audit-chain verifier (pnpm audit-chain:verify), not a re-implemented .cjs', () => {
    expect(workflow).toContain('audit-chain:verify');
    // Guard against the drift-prone anti-pattern the verifier header warns about.
    expect(workflow).not.toContain('audit-chain-verify.cjs');
  });

  it('runs the chain verification AFTER pg_restore and BEFORE the smoke queries', () => {
    const restoreIdx = lineIndexOf(workflow, 'pg_restore into ephemeral postgres');
    const verifyIdx = lineIndexOf(workflow, 'audit-chain:verify');
    const smokeIdx = lineIndexOf(workflow, 'name: Smoke queries');

    expect(restoreIdx).toBeGreaterThan(-1);
    expect(verifyIdx).toBeGreaterThan(-1);
    expect(smokeIdx).toBeGreaterThan(-1);

    expect(verifyIdx).toBeGreaterThan(restoreIdx);
    expect(verifyIdx).toBeLessThan(smokeIdx);
  });

  it('points the verifier at the restored ephemeral DB via PGDATABASE', () => {
    // The verifier resolves its database from PGDATABASE (env.ts:93 required()).
    // Without it the step would connect to the wrong DB or throw exit 2.
    const verifyIdx = lineIndexOf(workflow, 'audit-chain:verify');
    const block = workflow
      .split('\n')
      .slice(Math.max(0, verifyIdx - 20), verifyIdx + 5)
      .join('\n');
    expect(block).toMatch(/PGDATABASE:/);
  });
});
