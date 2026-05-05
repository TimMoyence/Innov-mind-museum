import 'dotenv/config';
import 'reflect-metadata';

import * as fs from 'node:fs';

import { AppDataSource } from '@data/db/data-source';
import { AUDIT_CHAIN_GENESIS_HASH, type AuditChainRow } from '@shared/audit/audit-chain';
import {
  verifyChainAndFormat,
  type AuditChainCliResult,
} from '@shared/audit/audit-chain-cli-core';
import { AuditLog } from '@shared/audit/auditLog.entity';

/**
 * Nightly audit-chain verification CLI.
 *
 * Walks `audit_logs` ordered by (created_at ASC, id ASC) and verifies the
 * SHA-256 prev_hash + row_hash chain is intact. Used by
 * `.github/workflows/audit-chain-nightly.yml`.
 *
 * Why TypeScript and not .cjs:
 *   The Musaium prod image (Dockerfile.prod) copies only `dist/` into the
 *   runtime stage — raw `scripts/` is NOT in the container. By writing this
 *   in TypeScript and adding it to tsconfig.json `include`, the build emits
 *   `dist/scripts/audit-chain-verify.js`, which is present in the container
 *   and can be invoked by the cron workflow via
 *   `docker compose exec backend node dist/scripts/audit-chain-verify.js`.
 *
 * Exit codes:
 *   0 — chain intact
 *   1 — chain break (a Slack alert is POSTed if DEPLOY_ALERT_SLACK_WEBHOOK is set)
 *   2 — unexpected error (DB connect failure, malformed fixture, etc.)
 *
 * Stdout: a single line of JSON describing the verdict (status + counters).
 *
 * Test mode: set AUDIT_CHAIN_VERIFY_FIXTURE to a JSON file containing an
 * array of AuditChainRow objects (createdAt as ISO 8601 string). The script
 * skips DB connect and runs the verifier on the fixture rows.
 */

function emitStdout(payload: AuditChainCliResult['payload']): void {
  process.stdout.write(JSON.stringify(payload) + '\n');
}

async function postSlackAlert(webhookUrl: string | undefined, text: string): Promise<void> {
  if (!webhookUrl) return;

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      process.stderr.write(
        `[audit-chain-verify] slack POST failed: ${res.status} ${res.statusText}\n`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[audit-chain-verify] slack POST error: ${msg}\n`);
  }
}

function loadFixtureRows(filePath: string): AuditChainRow[] {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`fixture is not a JSON array: ${filePath}`);
  }

  return parsed.map((r) => {
    const row = r as AuditChainRow & { createdAt: string | Date };
    return { ...row, createdAt: new Date(row.createdAt) };
  });
}

async function loadDbRows(): Promise<AuditChainRow[]> {
  await AppDataSource.initialize();
  try {
    const rows = await AppDataSource.getRepository(AuditLog).find({
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    return rows.map((r) => ({
      id: r.id,
      actorId: r.actorId,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      metadata: r.metadata,
      createdAt: r.createdAt,
      // Entity column allows null for legacy rows; the canonical chain expects
      // a string with the genesis sentinel for the very first row.
      prevHash: r.prevHash ?? AUDIT_CHAIN_GENESIS_HASH,
      rowHash: r.rowHash,
    }));
  } finally {
    await AppDataSource.destroy();
  }
}

async function main(): Promise<void> {
  const fixturePath = process.env.AUDIT_CHAIN_VERIFY_FIXTURE;
  const rows = fixturePath ? loadFixtureRows(fixturePath) : await loadDbRows();

  const result = verifyChainAndFormat(rows);

  emitStdout(result.payload);

  if (result.exitCode === 1 && result.alertText) {
    await postSlackAlert(process.env.DEPLOY_ALERT_SLACK_WEBHOOK, result.alertText);
  }

  process.exit(result.exitCode);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[audit-chain-verify] ${msg}\n`);
  process.exit(2);
});
