import {
  AUDIT_CHAIN_GENESIS_HASH,
  computeRowHash,
  verifyAuditChain,
} from '@shared/audit/audit-chain';

import { makeChain, makeChainRow } from '../../helpers/audit/chain.fixtures';

describe('audit-chain / verifyAuditChain', () => {
  it('returns valid for an empty chain', () => {
    const result = verifyAuditChain([]);
    expect(result).toEqual({ valid: true, firstBreakAt: null, firstBreakId: null, checked: 0 });
  });

  it('validates a clean 5-row chain', () => {
    const rows = makeChain(5);
    const result = verifyAuditChain(rows);
    expect(result.valid).toBe(true);
    expect(result.checked).toBe(5);
    expect(result.firstBreakAt).toBeNull();
  });

  it('detects a mutated action field in row #3', () => {
    const rows = makeChain(5);
    // Tamper with row index 2 (the third row). We only mutate action but
    // leave row_hash intact: verification must catch the inconsistency.
    rows[2] = { ...rows[2], action: 'TAMPERED' };

    const result = verifyAuditChain(rows);
    expect(result.valid).toBe(false);
    expect(result.firstBreakAt).toBe(2);
    expect(result.firstBreakId).toBe(rows[2].id);
  });

  it('detects a broken prev_hash link (e.g. row deletion)', () => {
    const rows = makeChain(5);
    // Simulate a deletion of row 2 by dropping it: row 3 now references a
    // prev_hash that doesn't match row 1's row_hash.
    const truncated = [rows[0], rows[2], rows[3], rows[4]];

    const result = verifyAuditChain(truncated);
    expect(result.valid).toBe(false);
    expect(result.firstBreakAt).toBe(1);
  });

  it('detects a tampered row_hash (someone re-signed partial data)', () => {
    const rows = makeChain(5);
    rows[1] = { ...rows[1], rowHash: 'f'.repeat(64) };

    const result = verifyAuditChain(rows);
    expect(result.valid).toBe(false);
    expect(result.firstBreakAt).toBe(1);
  });

  it('genesis row uses 64 zeros as prev_hash', () => {
    const rows = makeChain(1);
    expect(rows[0].prevHash).toBe(AUDIT_CHAIN_GENESIS_HASH);
    expect(verifyAuditChain(rows).valid).toBe(true);
  });

  it('computeRowHash is deterministic and order-insensitive for metadata keys', () => {
    const base = {
      id: '00000000-0000-0000-0000-000000000001',
      actorId: 42,
      action: 'TEST',
      targetType: 'user',
      targetId: '42',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const h1 = computeRowHash({ ...base, metadata: { a: 1, b: 2 } }, AUDIT_CHAIN_GENESIS_HASH);
    const h2 = computeRowHash({ ...base, metadata: { b: 2, a: 1 } }, AUDIT_CHAIN_GENESIS_HASH);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  it('makeChainRow allows custom fields while still producing a valid chain root', () => {
    const row = makeChainRow({
      id: '00000000-0000-0000-0000-000000000099',
      action: 'CUSTOM',
      metadata: { foo: 'bar' },
    });
    expect(verifyAuditChain([row]).valid).toBe(true);
  });
});
