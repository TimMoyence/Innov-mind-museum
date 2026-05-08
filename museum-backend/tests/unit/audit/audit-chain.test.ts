import { createHash } from 'node:crypto';

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
    // would still differ — but the next assertion (raw payload equality with
    // explicit ascending order) is what nails the comparator direction.
    const renamed = computeRowHash(
      { ...base, metadata: { z: 1, beta: 2, gamma: 3 } },
      AUDIT_CHAIN_GENESIS_HASH,
    );
    expect(renamed).not.toBe(ordered);

    // Pin the canonical sort order: recompute the expected digest by manually
    // sorting keys ascending and asserting equality. A reversed-sort mutant
    // would serialize {gamma,beta,alpha} and produce a different digest.
    const metadata = { alpha: 1, beta: 2, gamma: 3 };
    const sortedKeys = Object.keys(metadata).sort((a, b) => a.localeCompare(b));
    const metadataJson = JSON.stringify(metadata, sortedKeys);
    const expectedPayload = [
      base.id,
      base.actorId,
      base.action,
      base.targetType,
      base.targetId,
      metadataJson,
      base.createdAt.toISOString(),
      AUDIT_CHAIN_GENESIS_HASH,
    ].join('|');
    const expectedDigest = createHash('sha256').update(expectedPayload).digest('hex');
    expect(ordered).toBe(expectedDigest);
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
      row.metadata === null
        ? ''
        : JSON.stringify(
            row.metadata,
            Object.keys(row.metadata).sort((a, b) => a.localeCompare(b)),
          ),
      row.createdAt.toISOString(),
      row.prevHash,
    ].join('|');
    const base64Digest = createHash('sha256').update(payload).digest('base64');
    expect(base64Digest).not.toMatch(/^[0-9a-f]{64}$/);
    expect(base64Digest).not.toBe(digest);
  });
});
