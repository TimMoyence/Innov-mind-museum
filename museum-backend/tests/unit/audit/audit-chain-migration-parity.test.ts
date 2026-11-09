import { createHash } from 'node:crypto';

import {
  AUDIT_CHAIN_GENESIS_HASH,
  canonicalStringify,
  computeRowHash,
} from '@shared/audit/audit-chain';

interface RawRow {
  id: string;
  actor_id: number | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

function migrationHash(row: RawRow, prevHash: string): string {
  const payload = [
    row.id,
    row.actor_id ?? '',
    row.action,
    row.target_type ?? '',
    row.target_id ?? '',
    row.metadata === null ? '' : canonicalStringify(row.metadata),
    row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    prevHash,
  ].join('|');
  return createHash('sha256').update(payload).digest('hex');
}

describe('audit-chain / migration ↔ runtime parity', () => {
  const createdAt = new Date('2026-01-01T12:34:56.000Z');
  const id = '00000000-0000-0000-0000-000000000042';

  it('produces identical hashes for a row with multi-key unsorted metadata', () => {
    const metadata = { c: 1, a: 2, b: 3 };

    const migrationSideHash = migrationHash(
      {
        id,
        actor_id: 42,
        action: 'LOGIN',
        target_type: 'user',
        target_id: '42',
        metadata,
        created_at: createdAt,
      },
      AUDIT_CHAIN_GENESIS_HASH,
    );

    const runtimeSideHash = computeRowHash(
      {
        id,
        actorId: 42,
        action: 'LOGIN',
        targetType: 'user',
        targetId: '42',
        metadata,
        createdAt,
      },
      AUDIT_CHAIN_GENESIS_HASH,
    );

    expect(migrationSideHash).toBe(runtimeSideHash);
  });

  it('produces the same hash regardless of metadata insertion order', () => {
    const h1 = migrationHash(
      {
        id,
        actor_id: 1,
        action: 'UPDATE',
        target_type: null,
        target_id: null,
        metadata: { a: 1, b: 2, c: 3 },
        created_at: createdAt,
      },
      AUDIT_CHAIN_GENESIS_HASH,
    );
    const h2 = migrationHash(
      {
        id,
        actor_id: 1,
        action: 'UPDATE',
        target_type: null,
        target_id: null,
        metadata: { c: 3, a: 1, b: 2 },
        created_at: createdAt,
      },
      AUDIT_CHAIN_GENESIS_HASH,
    );

    expect(h1).toBe(h2);
  });

  it('produces identical hashes when metadata is null on both sides', () => {
    const migrationSideHash = migrationHash(
      {
        id,
        actor_id: null,
        action: 'GENESIS',
        target_type: null,
        target_id: null,
        metadata: null,
        created_at: createdAt,
      },
      AUDIT_CHAIN_GENESIS_HASH,
    );

    const runtimeSideHash = computeRowHash(
      {
        id,
        actorId: null,
        action: 'GENESIS',
        targetType: null,
        targetId: null,
        metadata: null,
        createdAt,
      },
      AUDIT_CHAIN_GENESIS_HASH,
    );

    expect(migrationSideHash).toBe(runtimeSideHash);
  });

  const nestedMetadata = {
    breach: {
      count: 1200,
      affectedDataClasses: ['account', 'email'],
      nested: { a: 1 },
    },
    items: [{ b: 2, a: 1 }, { a: 3 }],
    severity: 'high',
  };

  it('AC3 — produces identical hashes for runtime vs migration on nested metadata', () => {
    const migrationSideHash = migrationHash(
      {
        id,
        actor_id: 7,
        action: 'BREACH_DETECTED',
        target_type: 'breach',
        target_id: 'b1',
        metadata: nestedMetadata,
        created_at: createdAt,
      },
      AUDIT_CHAIN_GENESIS_HASH,
    );

    const runtimeSideHash = computeRowHash(
      {
        id,
        actorId: 7,
        action: 'BREACH_DETECTED',
        targetType: 'breach',
        targetId: 'b1',
        metadata: nestedMetadata,
        createdAt,
      },
      AUDIT_CHAIN_GENESIS_HASH,
    );

    expect(migrationSideHash).toBe(runtimeSideHash);
  });

  it('AC4 — canonicalStringify emits the exact deep-sorted canonical string (single source)', () => {
    const expected =
      '{' +
      '"breach":{"affectedDataClasses":["account","email"],"count":1200,"nested":{"a":1}},' +
      '"items":[{"a":1,"b":2},{"a":3}],' +
      '"severity":"high"' +
      '}';
    expect(canonicalStringify(nestedMetadata)).toBe(expected);
  });
});
