import { createHash } from 'node:crypto';

/** Genesis prev_hash for first audit log row (64 hex zeros). */
export const AUDIT_CHAIN_GENESIS_HASH = '0'.repeat(64);

/** Hash chain row shape. Decoupled from TypeORM entity. */
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

/** Fields needed to compute row_hash (prevHash separate). */
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
 * Canonical SHA-256 hash for an audit row.
 *
 * Layout (pipe-separated, UTF-8):
 *   id | actor_id | action | target_type | target_id | metadata_json | created_at_iso | prev_hash
 *
 * Null/undefined → empty string. Metadata JSON-stringified with sorted keys
 * so object key order doesn't break the chain.
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

export interface AuditChainVerifyResult {
  valid: boolean;
  /** Zero-based index of first broken row; null when chain intact. */
  firstBreakAt: number | null;
  firstBreakId: string | null;
  /** Total rows walked. */
  checked: number;
}

/**
 * Walks rows (oldest → newest), verifies each row_hash + prev_hash link.
 * Returns early on first mismatch. Empty input is valid.
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
