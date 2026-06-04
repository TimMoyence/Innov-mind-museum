import { createHash } from 'node:crypto';

import {
  AUDIT_CHAIN_GENESIS_HASH,
  computeRowHash,
  verifyAuditChain,
} from '@shared/audit/audit-chain';

import { makeChain, makeChainRow } from '../../helpers/audit/chain.fixtures';

/**
 * Deterministic, locale-independent comparator on UTF-16 code units (no nested
 * ternary so sonarjs/no-nested-conditional stays happy).
 * @param a left key
 * @param b right key
 * @returns -1, 0 or 1 by code-unit order
 */
function byCodeUnit(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * INDEPENDENT test oracle (AC5 / AUDIT-02). Hand-written deep-recursive canonical
 * serializer used ONLY to derive the EXPECTED digest. It is intentionally NOT the
 * production `canonicalStringify` and NOT `JSON.stringify(meta, Object.keys(meta).sort())`.
 *
 * Contract it encodes (what the spec says the production serializer MUST do):
 *   - objects: keys sorted at EVERY nesting level by UTF-16 code unit (`<`/`>`),
 *     each entry = JSON.stringify(key) + ':' + recurse(value).
 *   - arrays: order-preserved, each element recursed.
 *   - scalars/null: JSON.stringify(value).
 *
 * The buggy production runtime serializes nested objects as `{}` (replacer-allowlist
 * applied recursively but fed only top-level keys), so this oracle diverges from the
 * current runtime on any nested metadata — which is exactly the RED we want.
 * @param v value to serialize
 * @returns the canonical deep-sorted JSON string
 */
function oracleCanonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(oracleCanonical).join(',') + ']';
  const entries = Object.entries(v as Record<string, unknown>);
  entries.sort(([a], [b]) => byCodeUnit(a, b));
  return (
    '{' + entries.map(([k, val]) => JSON.stringify(k) + ':' + oracleCanonical(val)).join(',') + '}'
  );
}

/**
 * Independent oracle for the full row digest, using oracleCanonical for metadata.
 * @param input the audit chain input fields
 * @param input.id row id
 * @param input.actorId actor id or null
 * @param input.action action name
 * @param input.targetType target type or null
 * @param input.targetId target id or null
 * @param input.metadata metadata object or null
 * @param input.createdAt creation timestamp
 * @param prevHash previous row hash
 * @returns the expected SHA-256 hex digest
 */
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

  // --- AUDIT-01 / TD-61 : nested metadata MUST contribute to the hash ----------------------

  const nestedBase = {
    id: '00000000-0000-0000-0000-0000000000b1',
    actorId: 99,
    action: 'BREACH_DETECTED',
    targetType: 'breach',
    targetId: 'b1',
    createdAt: new Date('2026-04-26T08:00:00.000Z'),
  };

  it('AC1 — nested metadata value influences the hash (no collision on nested content)', () => {
    // Two rows identical on every field, differing ONLY by a value nested inside
    // metadata.breach (same TOP-LEVEL keys `{breach}`). With the buggy runtime
    // serializer both serialize to {"breach":{}} → SAME hash = collision (RED).
    const a = computeRowHash(
      { ...nestedBase, metadata: { breach: { count: 1200, severity: 'P0' } } },
      AUDIT_CHAIN_GENESIS_HASH,
    );
    const b = computeRowHash(
      { ...nestedBase, metadata: { breach: { count: 9999, severity: 'P0' } } },
      AUDIT_CHAIN_GENESIS_HASH,
    );
    expect(a).not.toBe(b);

    // Same defect on metadata.provider.{version} (guardrail-audit nested payload).
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
    // Differs only by insertion order INSIDE the nested breach object → same hash.
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
    // Oracle = oracleRowDigest (hand-written deep canonical serializer, NOT the
    // production fn and NOT JSON.stringify(meta, Object.keys.sort)). The buggy
    // runtime serializes {"breach":{}} while the oracle serializes the full nested
    // content → digests diverge today (RED), converge after the fix.
    const nestedMeta = {
      breach: { count: 1200, severity: 'P0', nested: { a: 1, b: 2 } },
      severity: 'high',
    };
    const nestedInput = { ...nestedBase, metadata: nestedMeta };
    expect(computeRowHash(nestedInput, AUDIT_CHAIN_GENESIS_HASH)).toBe(
      oracleRowDigest(nestedInput, AUDIT_CHAIN_GENESIS_HASH),
    );

    // Q4 — array of objects: each element's content + array order must matter.
    const arrMeta = { items: [{ b: 2, a: 1 }, { a: 3 }] };
    const arrInput = { ...nestedBase, action: 'ARR_EVT', metadata: arrMeta };
    expect(computeRowHash(arrInput, AUDIT_CHAIN_GENESIS_HASH)).toBe(
      oracleRowDigest(arrInput, AUDIT_CHAIN_GENESIS_HASH),
    );

    // Array order is significant: reversing the elements changes the digest.
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

  // --- Stryker mutation kill tests (predicted survivors, mutation testing) -------------------

  it('verifyAuditChain loop respects strict bounds (kills `<` -> `<=` mutation at L86)', () => {
    // With `index <= rows.length`, the loop tries to read rows[rows.length] which
    // is undefined and throws TypeError on `row.prevHash`. Even if a mutator picks
    // a non-throwing variant, `checked` would overshoot rows.length. We assert
    // both: no throw AND checked === rows.length exactly.
    const rows = makeChain(2);

    expect(() => verifyAuditChain(rows)).not.toThrow();

    const result = verifyAuditChain(rows);
    expect(result.valid).toBe(true);
    expect(result.checked).toBe(rows.length);
    expect(result.checked).toBe(2);
    expect(result.firstBreakAt).toBeNull();
  });

  it('computeRowHash sorts metadata keys ascending (kills reversed-sort mutation at L48)', () => {
    // The existing order-insensitive test ({a,b} vs {b,a}) does NOT kill a
    // reversed-sort mutant: both insertion orders sort to the same sequence
    // regardless of comparator direction. We need (1) insertion-order invariance
    // AND (2) sensitivity to actual key NAMES so reversed sort produces a
    // different canonical JSON and therefore a different digest.
    const base = {
      id: '00000000-0000-0000-0000-000000000042',
      actorId: 7,
      action: 'TEST_SORT',
      targetType: 'user',
      targetId: '7',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    // Insertion-order invariance with three keys (more stable than two).
    const ordered = computeRowHash(
      { ...base, metadata: { alpha: 1, beta: 2, gamma: 3 } },
      AUDIT_CHAIN_GENESIS_HASH,
    );
    const shuffled = computeRowHash(
      { ...base, metadata: { gamma: 3, alpha: 1, beta: 2 } },
      AUDIT_CHAIN_GENESIS_HASH,
    );
    expect(ordered).toBe(shuffled);

    // Renaming keys (a -> z) flips the sorted order under ascending vs descending
    // comparator and produces a distinct JSON canonicalization, so the digests
    // diverge. Under reversed sort, the canonical form would change and this
    // would still differ — but the next assertion (independent oracle on NESTED
    // metadata) is what nails both the comparator direction AND the deep mutant.
    const renamed = computeRowHash(
      { ...base, metadata: { z: 1, beta: 2, gamma: 3 } },
      AUDIT_CHAIN_GENESIS_HASH,
    );
    expect(renamed).not.toBe(ordered);

    // Pin the canonical sort order against the INDEPENDENT oracle (AC5) — NOT
    // `JSON.stringify(meta, Object.keys(meta).sort())` (the buggy oracle that let
    // the deep mutant survive). The oracle sorts keys ascending at EVERY level, so
    // a reversed-sort mutant OR a top-level-only serializer both diverge from it.
    // Using NESTED metadata (`outer.inner`) is what kills the deep mutant: a
    // top-level-only sort serializes the inner object as `{}`.
    const nestedSortInput = {
      ...base,
      metadata: { gamma: 3, alpha: 1, beta: 2, inner: { yy: 1, xx: 2 } },
    };
    expect(computeRowHash(nestedSortInput, AUDIT_CHAIN_GENESIS_HASH)).toBe(
      oracleRowDigest(nestedSortInput, AUDIT_CHAIN_GENESIS_HASH),
    );
  });

  it('verifyAuditChain advances expectedPrev between rows (kills assignment removal at L120)', () => {
    // If `expectedPrev = row.rowHash` is removed, expectedPrev stays at genesis
    // for every iteration. A valid 3-row chain would then fail at index 1
    // because row[1].prevHash = row[0].rowHash !== genesis.
    const rows = makeChain(3);

    const result = verifyAuditChain(rows);
    expect(result.valid).toBe(true);
    expect(result.checked).toBe(3);

    // Belt-and-braces: tamper row[2].rowHash. Original code detects it at
    // index 2 (chain progressed correctly through row 1). With assignment
    // removed, the code would have already returned valid:false at index 1
    // (genesis mismatch) — so firstBreakAt === 2 nails the chain progression.
    const tampered = [...rows];
    tampered[2] = { ...tampered[2], rowHash: 'a'.repeat(64) };

    const tamperedResult = verifyAuditChain(tampered);
    expect(tamperedResult.valid).toBe(false);
    expect(tamperedResult.firstBreakAt).toBe(2);
    expect(tamperedResult.firstBreakId).toBe(rows[2].id);
  });

  it('reports checked === index + 1 on a prevHash break (kills ArithmeticOperator `+ 1` -> `- 1` at L94)', () => {
    // Build a 3-row chain and tamper row[1].prevHash so verifyAuditChain
    // returns at the prevHash branch (the L89-95 early return) for index=1.
    // Original: checked = index + 1 = 2.
    // Mutant `index - 1`: checked = 0. Asserting === 2 kills the mutant.
    //
    // We also pin the index=0 boundary: forge a row with prev != genesis.
    // Original: checked = 0 + 1 = 1. Mutant: checked = -1. Asserting === 1
    // and >= 0 makes the mutant impossible to satisfy at the boundary.
    const rows = makeChain(3);
    const tampered = [...rows];
    tampered[1] = { ...tampered[1], prevHash: '0'.repeat(64) };

    const midResult = verifyAuditChain(tampered);
    expect(midResult.valid).toBe(false);
    expect(midResult.firstBreakAt).toBe(1);
    expect(midResult.checked).toBe(2);

    // Boundary at index=0 — the most damning case for the `- 1` mutant.
    const firstRowBroken = makeChainRow({
      id: '00000000-0000-0000-0000-000000000aaa',
      prevHash: 'b'.repeat(64), // not genesis → break at index 0
    });
    const boundary = verifyAuditChain([firstRowBroken]);
    expect(boundary.valid).toBe(false);
    expect(boundary.firstBreakAt).toBe(0);
    expect(boundary.checked).toBe(1);
    // Defensive: `checked` MUST be a non-negative count; mutant yields -1.
    expect(boundary.checked).toBeGreaterThanOrEqual(0);
  });

  it('computeRowHash returns SHA-256 hex digest (kills `hex` -> `base64`/other mutation at L62)', () => {
    // Hex digest of SHA-256 is exactly 64 lowercase hex chars. Base64 is 44
    // chars (ends with `=`), base64url is 43 chars, binary is 32 raw bytes.
    // The regex pinpoints hex specifically and also rejects uppercase-only
    // encodings (we use case-insensitive `i` flag for safety, but Node's hex
    // output is lowercase).
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

    // Independent verification: Node's base64 digest is a different length and
    // shape, so it cannot satisfy the hex regex. This documents the mutation
    // class explicitly.
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
