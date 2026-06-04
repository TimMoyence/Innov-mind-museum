import { createHash } from 'node:crypto';

import {
  AUDIT_CHAIN_GENESIS_HASH,
  canonicalStringify,
  computeRowHash,
} from '@shared/audit/audit-chain';

/**
 * Parity test between the hash logic in
 * `src/data/db/migrations/1777100000000-AddAuditLogHashChain.ts` and the
 * canonical `computeRowHash` in `src/shared/audit/audit-chain.ts` (AC3/AC4/AC5).
 *
 * AC4 (source unique) — this test imports the SAME `canonicalStringify` that the
 * runtime AND the migration use. It no longer re-implements `stableStringify`
 * inline: a second hand-written copy could diverge silently and would defeat the
 * single-source guarantee. Importing the production serializer means modifying
 * its definition makes this parity (and the snapshot below) fail — proving there
 * is exactly one effective canonicalization.
 *
 * NOTE (RED): `canonicalStringify` is created in the GREEN phase. In RED the
 * symbol does not exist yet → this file fails to type-check (tsc) and throws at
 * runtime (`canonicalStringify is not a function`), which is the intended RED for
 * AC3 (nested divergence) and AC4 (single source). See red task T1.5.
 */

interface RawRow {
  id: string;
  actor_id: number | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

/**
 * Models the hash the MIGRATION backfill computes. Post-fix (GREEN) the migration
 * serializes metadata via the SHARED `canonicalStringify` (single source, AC4), so
 * this helper uses the imported `canonicalStringify` — NOT a second inline copy.
 * @param row the raw DB row (snake_case) as the migration sees it
 * @param prevHash previous row hash
 * @returns the SHA-256 hex digest the migration backfill would compute
 */
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

  // --- AC3 : parity on NESTED metadata (>=2 levels + array of objects) ---------------------

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
    // With the buggy runtime serializer this DIVERGES: runtime serializes
    // {"breach":{},"items":[...],"severity":"high"} (nested keys dropped) while the
    // migration serializes the full nested content → different hashes (RED).
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

  // --- AC4 : single-source canonicalization — pin the serialized OUTPUT ---------------------

  it('AC4 — canonicalStringify emits the exact deep-sorted canonical string (single source)', () => {
    // The expected string is an AUDITED literal: keys sorted by code unit at every
    // level, arrays order-preserved, scalars via JSON.stringify. Any change to the
    // single canonical definition (sort comparator, nesting handling) breaks this
    // snapshot → proves there is no second divergent copy in play.
    const expected =
      '{' +
      '"breach":{"affectedDataClasses":["account","email"],"count":1200,"nested":{"a":1}},' +
      '"items":[{"a":1,"b":2},{"a":3}],' +
      '"severity":"high"' +
      '}';
    expect(canonicalStringify(nestedMetadata)).toBe(expected);
  });
});
