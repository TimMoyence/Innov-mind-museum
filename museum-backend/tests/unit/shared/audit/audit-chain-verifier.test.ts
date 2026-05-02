import {
  computeRowHash,
  AUDIT_CHAIN_GENESIS_HASH,
  type AuditChainRow,
} from '@shared/audit/audit-chain';
import { verifyAuditChain } from '@shared/audit/audit-chain-verifier';

function buildRow(
  i: number,
  prevHash: string,
  overrides: Partial<AuditChainRow> = {},
): AuditChainRow {
  const base = {
    id: `row-${i}`,
    actorId: 1,
    action: 'test.action',
    targetType: 'unit',
    targetId: String(i),
    metadata: { i },
    createdAt: new Date(2026, 4, 2, 12, 0, i),
  };
  const rowHash = computeRowHash(base, prevHash);
  return { ...base, prevHash, rowHash, ...overrides };
}

describe('verifyAuditChain', () => {
  it('reports intact for an empty list', () => {
    const result = verifyAuditChain([]);
    expect(result.intact).toBe(true);
    expect(result.rowsScanned).toBe(0);
    expect(result.break).toBeNull();
  });

  it('reports intact for a valid chain of 5 rows starting from genesis', () => {
    const rows: AuditChainRow[] = [];
    let prev = AUDIT_CHAIN_GENESIS_HASH;
    for (let i = 0; i < 5; i++) {
      const row = buildRow(i, prev);
      rows.push(row);
      prev = row.rowHash;
    }

    const result = verifyAuditChain(rows);
    expect(result.intact).toBe(true);
    expect(result.rowsScanned).toBe(5);
    expect(result.break).toBeNull();
  });

  it('detects break when prev_hash does not match previous row_hash', () => {
    const rows: AuditChainRow[] = [];
    let prev = AUDIT_CHAIN_GENESIS_HASH;
    for (let i = 0; i < 3; i++) {
      const row = buildRow(i, prev);
      rows.push(row);
      prev = row.rowHash;
    }
    // Tamper: row 1's prevHash points elsewhere.
    rows[1] = { ...rows[1], prevHash: '1'.repeat(64) };

    const result = verifyAuditChain(rows);
    expect(result.intact).toBe(false);
    expect(result.break?.rowId).toBe('row-1');
    expect(result.break?.rowIndex).toBe(1);
    expect(result.break?.actualPrevHash).toBe('1'.repeat(64));
  });

  it('detects break when row_hash was tampered (recompute mismatch)', () => {
    const rows: AuditChainRow[] = [];
    let prev = AUDIT_CHAIN_GENESIS_HASH;
    for (let i = 0; i < 3; i++) {
      const row = buildRow(i, prev);
      rows.push(row);
      prev = row.rowHash;
    }
    // Tamper: change action AFTER hash was computed (simulates post-insert mutation).
    const tamperedAction = 'rewritten.history';
    rows[2] = { ...rows[2], action: tamperedAction };
    // prevHash + rowHash kept; recompute will not match.

    const result = verifyAuditChain(rows);
    expect(result.intact).toBe(false);
    expect(result.break?.rowId).toBe('row-2');
    expect(result.break?.rowIndex).toBe(2);
    expect(result.break?.expectedRowHash).not.toBe(result.break?.actualRowHash);
  });

  it('detects break at the very first row if prevHash != genesis', () => {
    const row0 = buildRow(0, AUDIT_CHAIN_GENESIS_HASH);
    const tampered = { ...row0, prevHash: 'a'.repeat(64) };

    const result = verifyAuditChain([tampered]);
    expect(result.intact).toBe(false);
    expect(result.break?.rowIndex).toBe(0);
    expect(result.break?.expectedPrevHash).toBe(AUDIT_CHAIN_GENESIS_HASH);
  });
});
