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

/** Build a minimal AuditLogEntry. */
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

  beforeEach(() => {
    jest.clearAllMocks();
    const mocks = buildMocks();
    repo = mocks.repo;
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
