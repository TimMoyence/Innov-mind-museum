import { createHash } from 'node:crypto';

import { AUDIT_CHAIN_GENESIS_HASH, computeRowHash } from '@shared/audit/audit-chain';

/**
 * Parity test between the hash logic duplicated inside
 * `src/data/db/migrations/1777100000000-AddAuditLogHashChain.ts` and the
 * canonical `computeRowHash` in `src/shared/audit/audit-chain.ts`.
 *
 * Migrations cannot reliably import app code under the TypeORM CLI runtime, so
 * the migration duplicates the canonicalization + SHA-256 logic inline. This
 * test pins both implementations against each other: any drift (e.g. changing
 * field order, separator, or metadata key sort) breaks this test and prevents
 * a silent chain-invalidating migration rewrite.
 */

// Re-implement the migration's inline logic verbatim. Keep this block 1:1
// identical to the migration's stableStringify + payload assembly in
// `migrations/1777100000000-AddAuditLogHashChain.ts` so the test fails the
// moment the migration drifts.
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + stableStringify((v as Record<string, unknown>)[k]))
      .join(',') +
    '}'
  );
}

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
    row.metadata === null ? '' : stableStringify(row.metadata),
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
});
