/**
 * UFR-022 red phase — PR-8 `paginate` helper.
 * RUN_ID: 2026-05-23-pr-8-paginate.
 *
 * These tests intentionally FAIL pre-green: the module
 * `@shared/pagination/offset-paginate` does not yet exist. Green phase MUST
 * implement the helper per `design.md` §2.1 to make these pass.
 *
 * Spec sources of truth:
 *   .claude/skills/team/team-state/2026-05-23-pr-8-paginate/spec.md §4 R1 (signature),
 *                                                              §4 R5 (test cases),
 *                                                              §5 NFR-3 (type safety),
 *                                                              §6 W4 (key-order invariance),
 *                                                              §6 W6 (totalPages math).
 *   .claude/skills/team/team-state/2026-05-23-pr-8-paginate/design.md §2.1 (body),
 *                                                                §4.1 (test design table).
 *
 * Frozen-test discipline (UFR-022): this file is sha256-hashed in
 * `red-test-manifest.json`. Green phase MUST NOT modify it. Suspected bug →
 * emit `BLOCK-TEST-WRONG <file>:<line> <reason>`, do NOT touch.
 */
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

import { paginate } from '@shared/pagination/offset-paginate';

/**
 * Hand-rolled `SelectQueryBuilder` stub. Only the three methods the helper
 * calls are mocked (`skip`, `take`, `getManyAndCount`); all others would
 * throw via the cast if the helper ever invoked them — which it MUST NOT
 * per spec R1.4 (no `orderBy`) and R1.1 (no side-effects beyond `qb`).
 * @param entities
 * @param total
 */
function makeQbStub<T extends ObjectLiteral>(
  entities: T[],
  total: number,
): {
  qb: SelectQueryBuilder<T>;
  spies: {
    skip: jest.Mock;
    take: jest.Mock;
    getManyAndCount: jest.Mock;
  };
} {
  const skip = jest.fn().mockReturnThis();
  const take = jest.fn().mockReturnThis();
  const getManyAndCount = jest.fn().mockResolvedValue([entities, total]);
  const stub = { skip, take, getManyAndCount };
  return {
    qb: stub as unknown as SelectQueryBuilder<T>,
    spies: { skip, take, getManyAndCount },
  };
}

interface FakeEntity extends ObjectLiteral {
  id: number;
  name: string;
}

interface FakeDTO {
  id: number;
  label: string;
}

describe('paginate — offset pagination helper (PR-8)', () => {
  describe('C1 — return shape PaginatedResult<T>', () => {
    it('returns an object with the canonical PaginatedResult fields', async () => {
      const entities: FakeEntity[] = [
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
      ];
      const { qb } = makeQbStub(entities, 2);

      const result = await paginate(qb, { page: 1, limit: 10 });

      expect(result).toEqual({
        data: entities,
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('returns exactly the wire-format keys in canonical order (W4)', async () => {
      const { qb } = makeQbStub<FakeEntity>([], 0);

      const result = await paginate(qb, { page: 1, limit: 10 });

      // Field ORDER matters for JSON.stringify byte-identity across the wire.
      // Spec §6 W4 + design §4.1 C5 / spec R5.5.
      expect(Object.keys(result)).toEqual(['data', 'total', 'page', 'limit', 'totalPages']);
    });
  });

  describe('C2 — offset assembly via qb.skip((page-1)*limit).take(limit).getManyAndCount()', () => {
    it('calls skip and take with the correct offset arithmetic for page=3, limit=20 (R5.3)', async () => {
      const { qb, spies } = makeQbStub<FakeEntity>([], 0);

      await paginate(qb, { page: 3, limit: 20 });

      expect(spies.skip).toHaveBeenCalledTimes(1);
      expect(spies.skip).toHaveBeenCalledWith(40);
      expect(spies.take).toHaveBeenCalledTimes(1);
      expect(spies.take).toHaveBeenCalledWith(20);
    });

    it('calls skip(0) on page=1 (offset zero)', async () => {
      const { qb, spies } = makeQbStub<FakeEntity>([], 0);

      await paginate(qb, { page: 1, limit: 25 });

      expect(spies.skip).toHaveBeenCalledWith(0);
      expect(spies.take).toHaveBeenCalledWith(25);
    });

    it('calls getManyAndCount exactly once (R5.6 — no accidental extra round-trip)', async () => {
      const { qb, spies } = makeQbStub<FakeEntity>([{ id: 1, name: 'a' }], 1);

      await paginate(qb, { page: 1, limit: 10 });

      expect(spies.getManyAndCount).toHaveBeenCalledTimes(1);
    });
  });

  describe('C3 — mapper is optional', () => {
    it('without a mapper, returns entities cast to TDTO (identity branch, R5.1)', async () => {
      const entities: FakeEntity[] = [
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
        { id: 3, name: 'c' },
      ];
      const { qb } = makeQbStub(entities, 3);

      const result = await paginate(qb, { page: 1, limit: 10 });

      // Identity branch: same reference, no per-element copy.
      expect(result.data).toBe(entities);
      expect(result.data).toEqual(entities);
    });

    it('with a mapper, applies it per entity in order (R5.2)', async () => {
      const entities: FakeEntity[] = [
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
      ];
      const { qb } = makeQbStub(entities, 2);
      const mapper = jest.fn(
        (e: FakeEntity): FakeDTO => ({ id: e.id, label: e.name.toUpperCase() }),
      );

      const result = await paginate<FakeEntity, FakeDTO>(qb, { page: 1, limit: 10 }, mapper);

      expect(mapper).toHaveBeenCalledTimes(2);
      // Per-call argument check — order preserved.
      expect(mapper).toHaveBeenNthCalledWith(1, entities[0]);
      expect(mapper).toHaveBeenNthCalledWith(2, entities[1]);
      expect(result.data).toEqual([
        { id: 1, label: 'A' },
        { id: 2, label: 'B' },
      ]);
    });

    it('with a mapper, returned data[] length equals entities length', async () => {
      const entities: FakeEntity[] = Array.from({ length: 7 }, (_, i) => ({
        id: i + 1,
        name: `e${String(i)}`,
      }));
      const { qb } = makeQbStub(entities, 7);
      const mapper = (e: FakeEntity): FakeDTO => ({ id: e.id, label: e.name });

      const result = await paginate<FakeEntity, FakeDTO>(qb, { page: 1, limit: 10 }, mapper);

      expect(result.data).toHaveLength(7);
    });
  });

  describe('C4 — totalPages = Math.ceil(total / limit) (R5.4)', () => {
    it.each([
      { total: 0, limit: 10, expected: 0 },
      { total: 10, limit: 10, expected: 1 },
      { total: 21, limit: 10, expected: 3 },
      { total: 100, limit: 10, expected: 10 },
      { total: 1, limit: 10, expected: 1 },
      { total: 99, limit: 10, expected: 10 },
    ])('total=$total limit=$limit → totalPages=$expected', async ({ total, limit, expected }) => {
      const { qb } = makeQbStub<FakeEntity>([], total);

      const result = await paginate(qb, { page: 1, limit });

      expect(result.totalPages).toBe(expected);
    });
  });

  describe('C5 — getManyAndCount returning [entities, count] is consumed correctly', () => {
    it('threads entities through to data and count through to total', async () => {
      const entities: FakeEntity[] = [{ id: 42, name: 'x' }];
      const { qb } = makeQbStub(entities, 137);

      const result = await paginate(qb, { page: 2, limit: 50 });

      expect(result.data).toEqual(entities);
      expect(result.total).toBe(137);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(50);
    });

    it('echoes page and limit from params unchanged (wire invariance)', async () => {
      const { qb } = makeQbStub<FakeEntity>([], 0);

      const result = await paginate(qb, { page: 5, limit: 7 });

      expect(result.page).toBe(5);
      expect(result.limit).toBe(7);
    });
  });

  describe('C6 — edge cases', () => {
    it('total=0 → totalPages=0 and data is empty array (no mapper invoked)', async () => {
      const { qb } = makeQbStub<FakeEntity>([], 0);
      const mapper = jest.fn((e: FakeEntity): FakeDTO => ({ id: e.id, label: e.name }));

      const result = await paginate<FakeEntity, FakeDTO>(qb, { page: 1, limit: 10 }, mapper);

      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
      expect(result.data).toEqual([]);
      expect(mapper).not.toHaveBeenCalled();
    });

    it('total=limit exactly → totalPages=1', async () => {
      const entities: FakeEntity[] = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        name: `e${String(i)}`,
      }));
      const { qb } = makeQbStub(entities, 10);

      const result = await paginate(qb, { page: 1, limit: 10 });

      expect(result.totalPages).toBe(1);
    });

    it('total = limit + 1 → totalPages = 2 (off-by-one guard)', async () => {
      const { qb } = makeQbStub<FakeEntity>([], 11);

      const result = await paginate(qb, { page: 1, limit: 10 });

      expect(result.totalPages).toBe(2);
    });
  });
});
