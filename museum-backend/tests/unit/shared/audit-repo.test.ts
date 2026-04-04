import type { DataSource, Repository } from 'typeorm';

import { AuditLog } from '@shared/audit/auditLog.entity';
import { AuditRepositoryPg } from '@shared/audit/audit.repository.pg';

import type { AuditLogEntry } from '@shared/audit/audit.types';

// ─── TypeORM repo + DataSource mock factory ───
function buildMocks() {
  const repo = {
    save: jest.fn(),
    create: jest.fn().mockImplementation((data: unknown) => data),
  } as unknown as jest.Mocked<Repository<AuditLog>>;

  const dataSource = {
    getRepository: jest.fn().mockReturnValue(repo),
  } as unknown as DataSource;

  return { repo, dataSource };
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

      expect(repo.create).toHaveBeenCalledWith({
        action: 'AUTH_LOGIN_SUCCESS',
        actorType: 'user',
        actorId: 1,
        targetType: 'session',
        targetId: 'session-uuid-123',
        metadata: { browser: 'Chrome' },
        ip: '192.168.1.1',
        requestId: 'req-uuid-456',
      });
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

      expect(repo.create).toHaveBeenCalledWith({
        action: 'AUTH_LOGIN_SUCCESS',
        actorType: 'user',
        actorId: null,
        targetType: null,
        targetId: null,
        metadata: null,
        ip: null,
        requestId: null,
      });
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
  });

  // ─── insertBatch ───
  describe('insertBatch', () => {
    it('creates and saves multiple entries in a single call', async () => {
      const entries = [
        makeAuditEntry({ action: 'AUTH_LOGIN_SUCCESS', actorId: 1 }),
        makeAuditEntry({ action: 'AUTH_LOGOUT', actorId: 2 }),
        makeAuditEntry({ action: 'AUTH_REGISTER', actorId: 3 }),
      ];
      repo.save.mockResolvedValue([] as unknown as AuditLog);

      await sut.insertBatch(entries);

      expect(repo.create).toHaveBeenCalledTimes(3);
      expect(repo.save).toHaveBeenCalledTimes(1);

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

    it('passes the entities array to save, not individual entities', async () => {
      const entries = [
        makeAuditEntry({ action: 'API_KEY_CREATED' }),
        makeAuditEntry({ action: 'API_KEY_REVOKED' }),
      ];
      repo.save.mockResolvedValue([] as unknown as AuditLog);

      await sut.insertBatch(entries);

      // save should receive an array of created entities
      const saveArg = repo.save.mock.calls[0][0];
      expect(Array.isArray(saveArg)).toBe(true);
      expect(saveArg).toHaveLength(2);
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
      repo.save.mockResolvedValue([] as unknown as AuditLog);

      await sut.insertBatch(entries);

      expect(repo.create).toHaveBeenCalledWith({
        action: 'AUTH_LOGIN_SUCCESS',
        actorType: 'user',
        actorId: null,
        targetType: null,
        targetId: null,
        metadata: null,
        ip: null,
        requestId: null,
      });
    });

    it('handles a single-entry batch', async () => {
      const entries = [makeAuditEntry({ action: 'ACCOUNT_DELETED' })];
      repo.save.mockResolvedValue([] as unknown as AuditLog);

      await sut.insertBatch(entries);

      expect(repo.create).toHaveBeenCalledTimes(1);
      expect(repo.save).toHaveBeenCalledTimes(1);
    });
  });
});
