import {
  AUDIT_CHAIN_GENESIS_HASH,
  computeRowHash,
  type AuditChainRow,
} from '@shared/audit/audit-chain';

/**
 * Creates an AuditChainRow with sensible defaults and a correctly computed row_hash.
 * @param overrides
 * @param prevHash
 */
export function makeChainRow(
  overrides: Partial<AuditChainRow> = {},
  prevHash: string = AUDIT_CHAIN_GENESIS_HASH,
): AuditChainRow {
  const base: Omit<AuditChainRow, 'rowHash'> = {
    id: overrides.id ?? '00000000-0000-0000-0000-000000000001',
    actorId: overrides.actorId ?? null,
    action: overrides.action ?? 'AUTH_LOGIN_SUCCESS',
    targetType: overrides.targetType ?? null,
    targetId: overrides.targetId ?? null,
    metadata: overrides.metadata ?? null,
    createdAt: overrides.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
    prevHash: overrides.prevHash ?? prevHash,
  };

  const rowHash = overrides.rowHash ?? computeRowHash(base, base.prevHash);
  return { ...base, rowHash };
}

/**
 * Builds a correctly chained sequence of rows (each prev_hash = previous row_hash).
 * @param count
 */
export function makeChain(count: number): AuditChainRow[] {
  const rows: AuditChainRow[] = [];
  let prev = AUDIT_CHAIN_GENESIS_HASH;
  for (let i = 0; i < count; i += 1) {
    const row = makeChainRow(
      {
        id: `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`,
        action: `EVT_${i + 1}`,
        actorId: i + 1,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
        prevHash: prev,
      },
      prev,
    );
    rows.push(row);
    prev = row.rowHash;
  }
  return rows;
}
