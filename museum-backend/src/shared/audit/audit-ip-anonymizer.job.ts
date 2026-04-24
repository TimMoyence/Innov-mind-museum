import { logger } from '@shared/logger/logger';

import type { DataSource, EntityManager } from 'typeorm';

/**
 * Default batch size for the audit IP anonymizer job. Small enough to keep
 * transactions short (lock held ~ms per tick), large enough to avoid per-row
 * round-trip overhead. 1000 rows ≈ one 8 KB page in Postgres.
 */
const DEFAULT_BATCH_SIZE = 1000;

/** Row shape selected during batch lookup. */
interface AuditIpRow {
  id: string;
  ip: string;
}

/** Tuple returned by pg driver on UPDATE statements: [rows, affectedCount]. */
type UpdateResult = [unknown[], number];

/** Result returned by {@link runAuditIpAnonymizer}. */
export interface AuditIpAnonymizerResult {
  /** Number of rows whose `ip` column was rewritten in this run. */
  anonymized: number;
}

/**
 * CNIL / GDPR 13-month retention pass: scans `audit_logs` for rows older
 * than 13 months with a non-null `ip`, then rewrites that column to its
 * anonymized form (IPv4 → /24 mask, IPv6 → /64 mask). Runs inside a single
 * transaction that whitelists itself via `SET LOCAL
 * app.audit_anonymization_allowed = 'true'`, which the
 * `prevent_audit_log_mutation` trigger recognizes to let the UPDATE through.
 *
 * The hash chain is unaffected: `row_hash` is computed from
 * (id, actor_id, action, target_type, target_id, metadata, created_at,
 * prev_hash) — the `ip` field is deliberately excluded — so rewriting the
 * IP column does not break chain verification.
 *
 * Idempotent: running twice on already-anonymized rows yields the same IP
 * (masking a /24 again is a no-op) but does not re-count them, since after
 * the first pass their value stays stable.
 *
 * @param dataSource Live TypeORM DataSource used to open the anonymization transaction.
 * @param batchSize Upper bound on rows rewritten per invocation. Defaults to {@link DEFAULT_BATCH_SIZE}.
 * @returns Per-run count of rows whose `ip` column was rewritten.
 */
export async function runAuditIpAnonymizer(
  dataSource: DataSource,
  batchSize: number = DEFAULT_BATCH_SIZE,
): Promise<AuditIpAnonymizerResult> {
  let anonymized = 0;

  await dataSource.transaction(async (manager: EntityManager) => {
    // Whitelist this transaction for the append-only trigger. SET LOCAL
    // auto-reverts at COMMIT/ROLLBACK so no other session is ever affected.
    await manager.query(`SET LOCAL app.audit_anonymization_allowed = 'true'`);

    const rows = await manager.query<AuditIpRow[]>(
      `SELECT id, host(ip) AS ip
         FROM "audit_logs"
        WHERE "created_at" < NOW() - INTERVAL '13 months'
          AND "ip" IS NOT NULL
        LIMIT $1`,
      [batchSize],
    );

    if (rows.length === 0) return;

    const ids = rows.map((row) => row.id);

    const result = await manager.query<UpdateResult>(
      `UPDATE "audit_logs"
          SET "ip" = CASE
            WHEN family("ip") = 4 THEN host("ip")::inet & '255.255.255.0'::inet
            WHEN family("ip") = 6 THEN set_masklen("ip", 64)
            ELSE "ip"
          END
        WHERE "id" = ANY($1::uuid[])`,
      [ids],
    );

    // pg driver returns [rows, affectedCount] for UPDATE; typeorm normalizes
    // to the second element for non-SELECT queries on some adapters. Fall
    // back to the batch size we actually selected if we can't read it.
    anonymized = Array.isArray(result) && typeof result[1] === 'number' ? result[1] : rows.length;
  });

  logger.info('audit_ip_anonymized', { count: anonymized });

  return { anonymized };
}
