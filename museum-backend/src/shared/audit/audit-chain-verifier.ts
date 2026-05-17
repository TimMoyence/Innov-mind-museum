import { computeRowHash, AUDIT_CHAIN_GENESIS_HASH, type AuditChainRow } from './audit-chain';

export interface AuditChainVerificationResult {
  /** Excludes genesis sentinel. */
  rowsScanned: number;
  intact: boolean;
  /**
   * First detected break. `null` if intact. Reported on the row that failed:
   * either `prevHash !== previous row's rowHash`, or own `rowHash !==`
   * recomputed hash from its fields.
   */
  break: {
    rowId: string;
    rowIndex: number;
    expectedPrevHash: string;
    actualPrevHash: string;
    expectedRowHash: string;
    actualRowHash: string;
  } | null;
}

/**
 * V12 W8 helper. Run periodically (cron) against `audit_log` ordered
 * `created_at ASC, id ASC`. Tamper-evidence: any row inserted out of band, or
 * any field mutated post-insert, surfaces as break with exact failing row id.
 * Pure — does not query DB. Caller fetches rows in order.
 */
export function verifyAuditChain(
  rowsInOrder: readonly AuditChainRow[],
): AuditChainVerificationResult {
  let prevHash = AUDIT_CHAIN_GENESIS_HASH;
  let i = -1;

  for (const row of rowsInOrder) {
    i++;

    if (row.prevHash !== prevHash) {
      return {
        rowsScanned: i + 1,
        intact: false,
        break: {
          rowId: row.id,
          rowIndex: i,
          expectedPrevHash: prevHash,
          actualPrevHash: row.prevHash,
          expectedRowHash: row.rowHash,
          actualRowHash: row.rowHash,
        },
      };
    }

    const recomputed = computeRowHash(
      {
        id: row.id,
        actorId: row.actorId,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        metadata: row.metadata,
        createdAt: row.createdAt,
      },
      prevHash,
    );

    if (recomputed !== row.rowHash) {
      return {
        rowsScanned: i + 1,
        intact: false,
        break: {
          rowId: row.id,
          rowIndex: i,
          expectedPrevHash: prevHash,
          actualPrevHash: row.prevHash,
          expectedRowHash: recomputed,
          actualRowHash: row.rowHash,
        },
      };
    }

    prevHash = row.rowHash;
  }

  return {
    rowsScanned: rowsInOrder.length,
    intact: true,
    break: null,
  };
}
