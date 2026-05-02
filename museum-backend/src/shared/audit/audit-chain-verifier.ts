import { computeRowHash, AUDIT_CHAIN_GENESIS_HASH, type AuditChainRow } from './audit-chain';

/**
 * Result of verifying the audit-log hash chain from the genesis to the latest row.
 */
export interface AuditChainVerificationResult {
  /** Number of rows examined (excludes genesis sentinel). */
  rowsScanned: number;
  /** True iff every row's `prev_hash` and `row_hash` match the chain. */
  intact: boolean;
  /**
   * First detected break. `null` if `intact === true`. The break is reported on
   * the row that fails verification — that row's `prevHash` did not equal the
   * previous row's `rowHash`, or its own `rowHash` did not equal the recomputed
   * hash from its fields.
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
 * Verifies the integrity of an audit-log hash chain.
 *
 * V12 W8 helper. Run periodically (cron) against `audit_log` ordered by
 * `created_at ASC, id ASC`. Tamper-evidence guarantee: any row inserted out
 * of band, or any field mutated post-insert, surfaces as a break with the
 * exact failing row id.
 *
 * Pure function — does not query the DB. Caller fetches the rows in order.
 *
 * @param rowsInOrder Rows ordered chronologically (created_at ASC, id ASC).
 * @returns Verification result. `intact: true` ⇒ chain is consistent.
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
