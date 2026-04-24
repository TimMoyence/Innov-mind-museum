import { createHash } from 'node:crypto';

/** Genesis prev_hash for the very first audit log row (64 hex zeros). */
export const AUDIT_CHAIN_GENESIS_HASH = '0'.repeat(64);

/** Minimal row shape used by the hash chain. Deliberately decoupled from the TypeORM entity. */
export interface AuditChainRow {
  id: string;
  actorId: number | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  prevHash: string;
  rowHash: string;
}

/** Fields needed to compute a row_hash (prevHash provided separately). */
export interface AuditChainInput {
  id: string;
  actorId: number | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

/**
 * Computes the canonical SHA-256 hash for an audit row.
 *
 * Layout (pipe-separated, UTF-8):
 *   id | actor_id | action | target_type | target_id | metadata_json | created_at_iso | prev_hash
 *
 * Null/undefined fields serialize as empty string. Metadata is JSON-stringified
 * with sorted keys so object key order doesn't break the chain.
 *
 * @param input Row fields.
 * @param prevHash Hash of the immediately preceding row (or genesis for row #1).
 */
export function computeRowHash(input: AuditChainInput, prevHash: string): string {
  const metadataJson =
    input.metadata === null
      ? ''
      : JSON.stringify(
          input.metadata,
          Object.keys(input.metadata).sort((a, b) => a.localeCompare(b)),
        );

  const payload = [
    input.id,
    input.actorId ?? '',
    input.action,
    input.targetType ?? '',
    input.targetId ?? '',
    metadataJson,
    input.createdAt.toISOString(),
    prevHash,
  ].join('|');

  return createHash('sha256').update(payload).digest('hex');
}

/** Result of verifyAuditChain: indicates overall validity + first break index. */
export interface AuditChainVerifyResult {
  valid: boolean;
  /** Zero-based index of the first broken row; null when chain intact. */
  firstBreakAt: number | null;
  /** Row id at the break, if any. */
  firstBreakId: string | null;
  /** Total rows walked. */
  checked: number;
}

/**
 * Walks the given rows (oldest → newest) and verifies each row_hash + prev_hash link.
 *
 * Returns early on first mismatch. An empty input array is considered valid.
 *
 * @param rows Rows in creation order.
 */
export function verifyAuditChain(rows: readonly AuditChainRow[]): AuditChainVerifyResult {
  let expectedPrev = AUDIT_CHAIN_GENESIS_HASH;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];

    if (row.prevHash !== expectedPrev) {
      return {
        valid: false,
        firstBreakAt: index,
        firstBreakId: row.id,
        checked: index + 1,
      };
    }

    const expectedRowHash = computeRowHash(
      {
        id: row.id,
        actorId: row.actorId,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        metadata: row.metadata,
        createdAt: row.createdAt,
      },
      row.prevHash,
    );

    if (expectedRowHash !== row.rowHash) {
      return {
        valid: false,
        firstBreakAt: index,
        firstBreakId: row.id,
        checked: index + 1,
      };
    }

    expectedPrev = row.rowHash;
  }

  return { valid: true, firstBreakAt: null, firstBreakId: null, checked: rows.length };
}
