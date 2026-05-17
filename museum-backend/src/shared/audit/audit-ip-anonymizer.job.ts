import { logger } from '@shared/logger/logger';

import type { DataSource, EntityManager } from 'typeorm';

// Small enough for short transactions (~ms per tick), large enough to avoid
// per-row round-trip. 1000 rows ≈ one 8 KB Postgres page.
const DEFAULT_BATCH_SIZE = 1000;

interface AuditIpRow {
  id: string;
  ip: string;
}

/** pg UPDATE tuple: [rows, affectedCount]. */
type UpdateResult = [unknown[], number];

export interface AuditIpAnonymizerResult {
  anonymized: number;
}

/**
 * CNIL / GDPR 13-month retention pass. Scans `audit_logs` rows >13 months
 * with non-null `ip`, rewrites to anonymized form (IPv4 → /24, IPv6 → /64).
 * Runs in single transaction that whitelists itself via
 * `SET LOCAL app.audit_anonymization_allowed = 'true'`, which the
 * `prevent_audit_log_mutation` trigger recognizes to allow the UPDATE.
 *
 * Hash chain unaffected: `row_hash` is computed from (id, actor_id, action,
 * target_type, target_id, metadata, created_at, prev_hash) — `ip` deliberately
 * excluded — so rewriting `ip` does not break chain verification.
 *
 * Idempotent: re-masking /24 is a no-op; values stay stable after first pass.
 */
export async function runAuditIpAnonymizer(
  dataSource: DataSource,
  batchSize: number = DEFAULT_BATCH_SIZE,
): Promise<AuditIpAnonymizerResult> {
  let anonymized = 0;

  await dataSource.transaction(async (manager: EntityManager) => {
    // Whitelist this txn for append-only trigger. SET LOCAL auto-reverts at
    // COMMIT/ROLLBACK so no other session affected.
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

    // pg driver returns [rows, affectedCount]; some adapters normalize to
    // second element. Fall back to selected batch size if unreadable.
    anonymized = Array.isArray(result) && typeof result[1] === 'number' ? result[1] : rows.length;
  });

  logger.info('audit_ip_anonymized', { count: anonymized });

  return { anonymized };
}
