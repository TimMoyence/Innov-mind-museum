import { logger } from '@shared/logger/logger';

import type { DataSource, EntityManager } from 'typeorm';

const DEFAULT_BATCH_SIZE = 1000;

interface AuditIpRow {
  id: string;
  ip: string;
}

type UpdateResult = [unknown[], number];

export interface AuditIpAnonymizerResult {
  anonymized: number;
}

export async function runAuditIpAnonymizer(
  dataSource: DataSource,
  batchSize: number = DEFAULT_BATCH_SIZE,
): Promise<AuditIpAnonymizerResult> {
  let anonymized = 0;

  await dataSource.transaction(async (manager: EntityManager) => {
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

    anonymized = Array.isArray(result) && typeof result[1] === 'number' ? result[1] : rows.length;
  });

  logger.info('audit_ip_anonymized', { count: anonymized });

  return { anonymized };
}
