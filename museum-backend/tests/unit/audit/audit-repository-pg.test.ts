/**
 * RED (T1.8) — `AuditRepositoryPg.listForActor` for the DSAR export (B3, R12,
 * spec Q6). Returns the audit rows where `actor_id = userId` (the data
 * subject's own actions), read-only on the existing `actor_id` column.
 *
 * The repo reads through `this.dataSource`. We provide a fake DataSource whose
 * `getRepository(AuditLog)` exposes BOTH a `find` and a `createQueryBuilder`
 * path backed by the same in-memory rows filtered by `actorId`, so the green
 * author can implement `listForActor` with either API without breaking this
 * test. The assertion is on the RETURNED rows (actor_id === userId), not on the
 * internal query mechanism.
 *
 * FAILS at red baseline: `listForActor` is not implemented (the accessor
 * returns `undefined`), so the first assertion fails.
 */
import { AuditRepositoryPg } from '@shared/audit/audit.repository.pg';

import { makeAuditLogEntity } from 'tests/helpers/audit/auditLog.fixtures';
import { getListForActor } from 'tests/helpers/audit/list-for-actor.accessor';

import type { AuditLog } from '@shared/audit/auditLog.entity';
import type { DataSource } from 'typeorm';

interface FindWhere {
  actorId?: number;
}

/**
 * Fake DataSource exposing a single audit-logs repository backed by `rows`.
 * Both `find({ where: { actorId } })` and `createQueryBuilder(...).where(...)
 * .getMany()` honour the actorId filter.
 */
function makeFakeDataSource(rows: AuditLog[]): DataSource {
  const filterByActor = (actorId: number | undefined): AuditLog[] =>
    typeof actorId === 'number' ? rows.filter((r) => r.actorId === actorId) : [...rows];

  const repo = {
    find: jest.fn(async (opts?: { where?: FindWhere }): Promise<AuditLog[]> => {
      return filterByActor(opts?.where?.actorId);
    }),
    createQueryBuilder: jest.fn(() => {
      let captured: number | undefined;
      const qb: {
        where: jest.Mock;
        andWhere: jest.Mock;
        orderBy: jest.Mock;
        addOrderBy: jest.Mock;
        getMany: jest.Mock;
      } = {
        where: jest.fn((_clause: string, params?: { actorId?: number }) => {
          if (params && typeof params.actorId === 'number') captured = params.actorId;
          return qb;
        }),
        andWhere: jest.fn(() => qb),
        orderBy: jest.fn(() => qb),
        addOrderBy: jest.fn(() => qb),
        getMany: jest.fn(async (): Promise<AuditLog[]> => filterByActor(captured)),
      };
      return qb;
    }),
  };

  return {
    getRepository: jest.fn(() => repo),
  } as unknown as DataSource;
}

describe('AuditRepositoryPg.listForActor (B3 / R12 / Q6)', () => {
  const rows = [
    makeAuditLogEntity({ id: 'a1', actorId: 42, action: 'AUTH_LOGIN_SUCCESS' }),
    makeAuditLogEntity({ id: 'a2', actorId: 42, action: 'ACCOUNT_DELETED' }),
    makeAuditLogEntity({ id: 'a3', actorId: 99, action: 'AUTH_LOGIN_SUCCESS' }),
    makeAuditLogEntity({ id: 'a4', actorId: null, action: 'SECURITY_RATE_LIMIT' }),
  ];

  it('is implemented on AuditRepositoryPg (RED: not yet implemented)', () => {
    const repo = new AuditRepositoryPg(makeFakeDataSource(rows));
    expect(getListForActor(repo)).toBeInstanceOf(Function);
  });

  it('returns only the rows where actor_id = the given userId', async () => {
    const repo = new AuditRepositoryPg(makeFakeDataSource(rows));
    const listForActor = getListForActor(repo);
    expect(listForActor).toBeInstanceOf(Function);

    const result = await listForActor!(42);

    expect(result.length).toBe(2);
    expect(result.every((r) => r.actorId === 42)).toBe(true);
    const ids = result.map((r) => r.id).sort();
    expect(ids).toEqual(['a1', 'a2']);
  });

  it('returns an empty array for an actor with no rows', async () => {
    const repo = new AuditRepositoryPg(makeFakeDataSource(rows));
    const listForActor = getListForActor(repo);
    expect(listForActor).toBeInstanceOf(Function);

    const result = await listForActor!(12345);
    expect(result).toEqual([]);
  });
});
