import type { EntityManager, Repository } from 'typeorm';
import { AuditLog } from '@shared/audit/auditLog.entity';
import { AuditRepositoryPg } from '@shared/audit/audit.repository.pg';
import type { AuditLogEntry } from '@shared/audit/audit.types';
import { makeAuditLog } from 'tests/helpers/admin/admin.fixtures';
import { makeMockTypeOrmRepo } from 'tests/helpers/shared/mock-deps';
import type { DataSource } from 'typeorm';

// ─── Transaction-aware mock factory ───
// AuditRepositoryPg now wraps all writes in `dataSource.transaction(manager => ...)`
// The callback calls `manager.query(...)` (advisory lock + tail row lookup) and
// `manager.getRepository(AuditLog).create/save(...)` to persist the row.
function buildMocks(tailRowHash: string | null = null) {
  const { repo } = makeMockTypeOrmRepo<AuditLog>();

  // `query` is invoked twice per append: once for `pg_advisory_xact_lock`,
  // then once for the tail `SELECT row_hash`. We route based on the SQL text.
  const managerQuery = jest.fn((sql: string) => {
    if (sql.includes('pg_advisory_xact_lock')) return Promise.resolve([]);
    if (sql.includes('SELECT "row_hash"')) {
      return Promise.resolve(tailRowHash === null ? [] : [{ row_hash: tailRowHash }]);
    }
    return Promise.resolve([]);
  });

  const manager = {
    query: managerQuery,
    getRepository: jest.fn().mockReturnValue(repo),
  } as unknown as EntityManager;

  const dataSource = {
    transaction: jest.fn(async <T>(cb: (m: EntityManager) => Promise<T>): Promise<T> => {
      return await cb(manager);
    }),
  } as unknown as DataSource;

  return { repo, dataSource, manager, managerQuery };
}

/**
 * Build a minimal AuditLogEntry.
 * @param overrides
 */
function makeAuditEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    action: 'AUTH_LOGIN_SUCCESS',
    actorType: 'user',
    actorId: 1,
    targetType: 'session',
    targetId: 'session-uuid-123',
    metadata: { browser: 'Chrome' },
    ip: '192.168.1.1',
    requestId: 'req-uuid-456',
    ...overrides,
  };
}

const HEX_64 = /^[0-9a-f]{64}$/;

describe('AuditRepositoryPg', () => {
  let sut: AuditRepositoryPg;
  let repo: jest.Mocked<Repository<AuditLog>>;
  let managerQuery: jest.Mock;
  let dataSource: DataSource;

  beforeEach(() => {
    jest.clearAllMocks();
    const mocks = buildMocks();
    repo = mocks.repo;
    managerQuery = mocks.managerQuery;
    dataSource = mocks.dataSource;
    sut = new AuditRepositoryPg(mocks.dataSource);
  });

  // ─── insert ───
  describe('insert', () => {
    it('creates and saves a single audit log entry with all fields', async () => {
      const entry = makeAuditEntry();
      repo.save.mockResolvedValue({} as AuditLog);

      await sut.insert(entry);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'AUTH_LOGIN_SUCCESS',
          actorType: 'user',
          actorId: 1,
          targetType: 'session',
          targetId: 'session-uuid-123',
          metadata: { browser: 'Chrome' },
          ip: '192.168.1.1',
          requestId: 'req-uuid-456',
        }),
      );
      const createArg = repo.create.mock.calls[0][0] as {
        id: string;
        prevHash: string;
        rowHash: string;
        createdAt: Date;
      };
      expect(typeof createArg.id).toBe('string');
      expect(createArg.id.length).toBeGreaterThan(0);
      expect(createArg.prevHash).toMatch(HEX_64);
      expect(createArg.rowHash).toMatch(HEX_64);
      expect(createArg.createdAt).toBeInstanceOf(Date);
      expect(repo.save).toHaveBeenCalled();
    });

    it('sets optional fields to null when not provided', async () => {
      const entry = makeAuditEntry({
        actorId: undefined,
        targetType: undefined,
        targetId: undefined,
        metadata: undefined,
        ip: undefined,
        requestId: undefined,
      });
      repo.save.mockResolvedValue({} as AuditLog);

      await sut.insert(entry);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'AUTH_LOGIN_SUCCESS',
          actorType: 'user',
          actorId: null,
          targetType: null,
          targetId: null,
          metadata: null,
          ip: null,
          requestId: null,
        }),
      );
    });

    it('handles system actor type', async () => {
      const entry = makeAuditEntry({
        actorType: 'system',
        actorId: null,
        action: 'SECURITY_RATE_LIMIT',
      });
      repo.save.mockResolvedValue({} as AuditLog);

      await sut.insert(entry);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          actorType: 'system',
          actorId: null,
          action: 'SECURITY_RATE_LIMIT',
        }),
      );
    });

    it('handles anonymous actor type', async () => {
      const entry = makeAuditEntry({
        actorType: 'anonymous',
        actorId: null,
        action: 'AUTH_LOGIN_FAILED',
      });
      repo.save.mockResolvedValue({} as AuditLog);

      await sut.insert(entry);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          actorType: 'anonymous',
          actorId: null,
        }),
      );
    });

    it('preserves metadata object structure', async () => {
      const complexMetadata = {
        attempts: 3,
        blocked: true,
        reasons: ['rate_limit', 'suspicious'],
      };
      const entry = makeAuditEntry({ metadata: complexMetadata });
      repo.save.mockResolvedValue({} as AuditLog);

      await sut.insert(entry);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: complexMetadata }),
      );
    });

    it('computes a fresh row_hash and chains prev_hash from the tail row', async () => {
      // Simulate an existing chain tail so prevHash picks it up.
      const existingTail = 'a'.repeat(64);
      const mocks = buildMocks(existingTail);
      const sutWithTail = new AuditRepositoryPg(mocks.dataSource);
      mocks.repo.save.mockResolvedValue({} as AuditLog);

      await sutWithTail.insert(makeAuditEntry());

      const createArg = mocks.repo.create.mock.calls[0][0] as {
        prevHash: string;
        rowHash: string;
      };
      expect(createArg.prevHash).toBe(existingTail);
      expect(createArg.rowHash).toMatch(HEX_64);
      expect(createArg.rowHash).not.toBe(existingTail);
    });

    it('issues advisory lock BEFORE the tail SELECT (chain serialization)', async () => {
      // Mutant: removing `await this.acquireChainLock(manager)` would still
      // produce a valid INSERT but allow concurrent writers to race on the
      // chain tail. Assert the exact ordering: pg_advisory_xact_lock first,
      // then the tail SELECT, then repo.save — not in any other order.
      repo.save.mockResolvedValue({} as AuditLog);

      await sut.insert(makeAuditEntry());

      expect(managerQuery).toHaveBeenCalledTimes(2);
      const firstSql = managerQuery.mock.calls[0][0] as string;
      const secondSql = managerQuery.mock.calls[1][0] as string;
      expect(firstSql).toContain('pg_advisory_xact_lock');
      expect(secondSql).toContain('SELECT "row_hash"');
      // save must have run AFTER both query calls (lock+tail) finished.
      const lockOrder = managerQuery.mock.invocationCallOrder[0];
      const tailOrder = managerQuery.mock.invocationCallOrder[1];
      const saveOrder = repo.save.mock.invocationCallOrder[0];
      expect(lockOrder).toBeLessThan(tailOrder);
      expect(tailOrder).toBeLessThan(saveOrder);
    });

    it('selects the tail row with DESC ordering on created_at AND id', async () => {
      // Mutant: `ORDER BY ... DESC` → `ASC` would pull the OLDEST row as the
      // tail, corrupting the hash chain on every append. Assert the literal
      // SQL contains DESC for both ordering columns.
      repo.save.mockResolvedValue({} as AuditLog);

      await sut.insert(makeAuditEntry());

      const tailCall = managerQuery.mock.calls.find((call) =>
        (call[0] as string).includes('SELECT "row_hash"'),
      );
      expect(tailCall).toBeDefined();
      const tailSql = tailCall![0] as string;
      expect(tailSql).toContain('"created_at" DESC');
      expect(tailSql).toContain('"id" DESC');
      expect(tailSql).toContain('LIMIT 1');
    });

    it('preserves actorId === 0 (uses ?? not ||)', async () => {
      // Mutant: `entry.actorId ?? null` → `entry.actorId || null` would
      // collapse a valid `0` actorId to null. Feed 0 and assert it is
      // persisted as exactly 0 (not coerced to null).
      const entry = makeAuditEntry({ actorId: 0 });
      repo.save.mockResolvedValue({} as AuditLog);

      await sut.insert(entry);

      const createArg = repo.create.mock.calls[0][0] as { actorId: number | null };
      expect(createArg.actorId).toBe(0);
      expect(createArg.actorId).not.toBeNull();
    });
  });

  // ─── insertBatch ───
  describe('insertBatch', () => {
    it('creates and saves multiple entries chained in order', async () => {
      const entries = [
        makeAuditEntry({ action: 'AUTH_LOGIN_SUCCESS', actorId: 1 }),
        makeAuditEntry({ action: 'AUTH_LOGOUT', actorId: 2 }),
        makeAuditEntry({ action: 'AUTH_REGISTER', actorId: 3 }),
      ];
      repo.save.mockResolvedValue(makeAuditLog());

      await sut.insertBatch(entries);

      // Each entry produces its own create + save call (one per row, chained).
      expect(repo.create).toHaveBeenCalledTimes(3);
      expect(repo.save).toHaveBeenCalledTimes(3);

      // Verify each entry was created correctly
      expect(repo.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          action: 'AUTH_LOGIN_SUCCESS',
          actorId: 1,
        }),
      );
      expect(repo.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          action: 'AUTH_LOGOUT',
          actorId: 2,
        }),
      );
      expect(repo.create).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          action: 'AUTH_REGISTER',
          actorId: 3,
        }),
      );
    });

    it('does nothing for an empty array', async () => {
      await sut.insertBatch([]);

      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('skips the transaction (no lock acquire) for an empty batch', async () => {
      // Mutant: removing the `if (entries.length === 0) return;` early-return
      // would still call `dataSource.transaction` and acquire the advisory
      // lock for nothing — wasteful and observable. Assert the wrapper is
      // never invoked AND no SQL (lock or tail) hits the manager.
      await sut.insertBatch([]);

      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(managerQuery).not.toHaveBeenCalled();
    });

    it('short-circuits ALL side-effects for an empty batch (kills ConditionalExpression→false at L47)', async () => {
      // Direct kill of the L47 Stryker survivor: `entries.length === 0` mutated
      // to `false` would skip the early return for an empty array, then call
      // `dataSource.transaction` → `acquireChainLock` (a managerQuery hit) and
      // walk an empty for-loop. Assert the precise no-side-effect contract:
      // zero transaction wrappers, zero SQL, zero entity create/save calls.
      // The promise must still resolve to `undefined` (no throw, no return).
      const before = (dataSource.transaction as jest.Mock).mock.calls.length;
      const queriesBefore = managerQuery.mock.calls.length;
      const createsBefore = repo.create.mock.calls.length;
      const savesBefore = repo.save.mock.calls.length;

      const result = await sut.insertBatch([]);

      expect(result).toBeUndefined();
      expect((dataSource.transaction as jest.Mock).mock.calls.length).toBe(before);
      expect(managerQuery.mock.calls.length).toBe(queriesBefore);
      expect(repo.create.mock.calls.length).toBe(createsBefore);
      expect(repo.save.mock.calls.length).toBe(savesBefore);
    });

    it('each row stores a valid hash pair (prev_hash + row_hash)', async () => {
      const entries = [
        makeAuditEntry({ action: 'API_KEY_CREATED' }),
        makeAuditEntry({ action: 'API_KEY_REVOKED' }),
      ];
      repo.save.mockResolvedValue(makeAuditLog());

      await sut.insertBatch(entries);

      for (const call of repo.create.mock.calls) {
        const arg = call[0] as { prevHash: string; rowHash: string };
        expect(arg.prevHash).toMatch(HEX_64);
        expect(arg.rowHash).toMatch(HEX_64);
      }
    });

    it('maps optional fields to null for each entry in batch', async () => {
      const entries = [
        makeAuditEntry({
          actorId: undefined,
          targetType: undefined,
          targetId: undefined,
          metadata: undefined,
          ip: undefined,
          requestId: undefined,
        }),
      ];
      repo.save.mockResolvedValue(makeAuditLog());

      await sut.insertBatch(entries);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'AUTH_LOGIN_SUCCESS',
          actorType: 'user',
          actorId: null,
          targetType: null,
          targetId: null,
          metadata: null,
          ip: null,
          requestId: null,
        }),
      );
    });

    it('handles a single-entry batch', async () => {
      const entries = [makeAuditEntry({ action: 'ACCOUNT_DELETED' })];
      repo.save.mockResolvedValue(makeAuditLog());

      await sut.insertBatch(entries);

      expect(repo.create).toHaveBeenCalledTimes(1);
      expect(repo.save).toHaveBeenCalledTimes(1);
    });
  });
});
