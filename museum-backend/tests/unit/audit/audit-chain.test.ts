import { createHash } from 'node:crypto';

import {
  AUDIT_CHAIN_GENESIS_HASH,
  computeRowHash,
  verifyAuditChain,
} from '@shared/audit/audit-chain';

import { makeChain, makeChainRow } from '../../helpers/audit/chain.fixtures';

function byCodeUnit(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function oracleCanonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(oracleCanonical).join(',') + ']';
  const entries = Object.entries(v as Record<string, unknown>);
  entries.sort(([a], [b]) => byCodeUnit(a, b));
  return (
    '{' + entries.map(([k, val]) => JSON.stringify(k) + ':' + oracleCanonical(val)).join(',') + '}'
  );
}

function oracleRowDigest(
  input: {
    id: string;
    actorId: number | null;
    action: string;
    targetType: string | null;
    targetId: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
  },
  prevHash: string,
): string {
  const metadataJson = input.metadata === null ? '' : oracleCanonical(input.metadata);
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
    rows[2] = { ...rows[2], action: 'TAMPERED' };

    const result = verifyAuditChain(rows);
    expect(result.valid).toBe(false);
    expect(result.firstBreakAt).toBe(2);
    expect(result.firstBreakId).toBe(rows[2].id);
  });

  it('detects a broken prev_hash link (e.g. row deletion)', () => {
    const rows = makeChain(5);
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

  const nestedBase = {
    id: '00000000-0000-0000-0000-0000000000b1',
    actorId: 99,
    action: 'BREACH_DETECTED',
    targetType: 'breach',
    targetId: 'b1',
    createdAt: new Date('2026-04-26T08:00:00.000Z'),
  };

  it('AC1 — nested metadata value influences the hash (no collision on nested content)', () => {
    const a = computeRowHash(
      { ...nestedBase, metadata: { breach: { count: 1200, severity: 'P0' } } },
      AUDIT_CHAIN_GENESIS_HASH,
    );
    const b = computeRowHash(
      { ...nestedBase, metadata: { breach: { count: 9999, severity: 'P0' } } },
      AUDIT_CHAIN_GENESIS_HASH,
    );
    expect(a).not.toBe(b);

    const p1 = computeRowHash(
      {
        ...nestedBase,
        action: 'GUARDRAIL_BLOCK',
        metadata: { provider: { name: 'openai', version: 'v1' } },
      },
      AUDIT_CHAIN_GENESIS_HASH,
    );
    const p2 = computeRowHash(
      {
        ...nestedBase,
        action: 'GUARDRAIL_BLOCK',
        metadata: { provider: { name: 'openai', version: 'v2' } },
      },
      AUDIT_CHAIN_GENESIS_HASH,
    );
    expect(p1).not.toBe(p2);
  });

  it('AC2 — hash is invariant to nested key insertion order (non-regression, deterministic)', () => {
    const a = computeRowHash(
      {
        ...nestedBase,
        metadata: { breach: { count: 1200, severity: 'P0', source: 'sentry' } },
      },
      AUDIT_CHAIN_GENESIS_HASH,
    );
    const b = computeRowHash(
      {
        ...nestedBase,
        metadata: { breach: { source: 'sentry', count: 1200, severity: 'P0' } },
      },
      AUDIT_CHAIN_GENESIS_HASH,
    );
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('AC5 — computeRowHash matches an INDEPENDENT oracle on nested metadata + array of objects', () => {
    const nestedMeta = {
      breach: { count: 1200, severity: 'P0', nested: { a: 1, b: 2 } },
      severity: 'high',
    };
    const nestedInput = { ...nestedBase, metadata: nestedMeta };
    expect(computeRowHash(nestedInput, AUDIT_CHAIN_GENESIS_HASH)).toBe(
      oracleRowDigest(nestedInput, AUDIT_CHAIN_GENESIS_HASH),
    );

    const arrMeta = { items: [{ b: 2, a: 1 }, { a: 3 }] };
    const arrInput = { ...nestedBase, action: 'ARR_EVT', metadata: arrMeta };
    expect(computeRowHash(arrInput, AUDIT_CHAIN_GENESIS_HASH)).toBe(
      oracleRowDigest(arrInput, AUDIT_CHAIN_GENESIS_HASH),
    );

    const arrReversed = {
      ...nestedBase,
      action: 'ARR_EVT',
      metadata: { items: [{ a: 3 }, { b: 2, a: 1 }] },
    };
    expect(computeRowHash(arrInput, AUDIT_CHAIN_GENESIS_HASH)).not.toBe(
      computeRowHash(arrReversed, AUDIT_CHAIN_GENESIS_HASH),
    );
  });

  it('makeChainRow allows custom fields while still producing a valid chain root', () => {
    const row = makeChainRow({
      id: '00000000-0000-0000-0000-000000000099',
      action: 'CUSTOM',
      metadata: { foo: 'bar' },
    });
    expect(verifyAuditChain([row]).valid).toBe(true);
  });

  it('verifyAuditChain loop respects strict bounds (kills `<` -> `<=` mutation at L86)', () => {
    const rows = makeChain(2);

    expect(() => verifyAuditChain(rows)).not.toThrow();

    const result = verifyAuditChain(rows);
    expect(result.valid).toBe(true);
    expect(result.checked).toBe(rows.length);
    expect(result.checked).toBe(2);
    expect(result.firstBreakAt).toBeNull();
  });

  it('computeRowHash sorts metadata keys ascending (kills reversed-sort mutation at L48)', () => {
    const base = {
      id: '00000000-0000-0000-0000-000000000042',
      actorId: 7,
      action: 'TEST_SORT',
      targetType: 'user',
      targetId: '7',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    const ordered = computeRowHash(
      { ...base, metadata: { alpha: 1, beta: 2, gamma: 3 } },
      AUDIT_CHAIN_GENESIS_HASH,
    );
    const shuffled = computeRowHash(
      { ...base, metadata: { gamma: 3, alpha: 1, beta: 2 } },
      AUDIT_CHAIN_GENESIS_HASH,
    );
    expect(ordered).toBe(shuffled);

    const renamed = computeRowHash(
      { ...base, metadata: { z: 1, beta: 2, gamma: 3 } },
      AUDIT_CHAIN_GENESIS_HASH,
    );
    expect(renamed).not.toBe(ordered);

    const nestedSortInput = {
      ...base,
      metadata: { gamma: 3, alpha: 1, beta: 2, inner: { yy: 1, xx: 2 } },
    };
    expect(computeRowHash(nestedSortInput, AUDIT_CHAIN_GENESIS_HASH)).toBe(
      oracleRowDigest(nestedSortInput, AUDIT_CHAIN_GENESIS_HASH),
    );
  });

  it('verifyAuditChain advances expectedPrev between rows (kills assignment removal at L120)', () => {
    const rows = makeChain(3);

    const result = verifyAuditChain(rows);
    expect(result.valid).toBe(true);
    expect(result.checked).toBe(3);

    const tampered = [...rows];
    tampered[2] = { ...tampered[2], rowHash: 'a'.repeat(64) };

    const tamperedResult = verifyAuditChain(tampered);
    expect(tamperedResult.valid).toBe(false);
    expect(tamperedResult.firstBreakAt).toBe(2);
    expect(tamperedResult.firstBreakId).toBe(rows[2].id);
  });

  it('reports checked === index + 1 on a prevHash break (kills ArithmeticOperator `+ 1` -> `- 1` at L94)', () => {
    const rows = makeChain(3);
    const tampered = [...rows];
    tampered[1] = { ...tampered[1], prevHash: '0'.repeat(64) };

    const midResult = verifyAuditChain(tampered);
    expect(midResult.valid).toBe(false);
    expect(midResult.firstBreakAt).toBe(1);
    expect(midResult.checked).toBe(2);

    const firstRowBroken = makeChainRow({
      id: '00000000-0000-0000-0000-000000000aaa',
      prevHash: 'b'.repeat(64),
    });
    const boundary = verifyAuditChain([firstRowBroken]);
    expect(boundary.valid).toBe(false);
    expect(boundary.firstBreakAt).toBe(0);
    expect(boundary.checked).toBe(1);
    expect(boundary.checked).toBeGreaterThanOrEqual(0);
  });

  it('computeRowHash returns SHA-256 hex digest (kills `hex` -> `base64`/other mutation at L62)', () => {
    const row = makeChainRow({ id: '00000000-0000-0000-0000-0000000000aa' });
    const digest = computeRowHash(
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

    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).toHaveLength(64);

    const payload = [
      row.id,
      row.actorId ?? '',
      row.action,
      row.targetType ?? '',
      row.targetId ?? '',
      row.metadata === null ? '' : oracleCanonical(row.metadata),
      row.createdAt.toISOString(),
      row.prevHash,
    ].join('|');
    const base64Digest = createHash('sha256').update(payload).digest('base64');
    expect(base64Digest).not.toMatch(/^[0-9a-f]{64}$/);
    expect(base64Digest).not.toBe(digest);
  });
});
