import { AuditService } from '@shared/audit/audit.service';
import type { IAuditLogRepository } from '@shared/audit/audit.repository.interface';
import type { AuditLogEntry } from '@shared/audit/audit.types';

const makeRepo = (overrides: Partial<IAuditLogRepository> = {}): IAuditLogRepository => ({
  insert: jest.fn().mockResolvedValue(undefined),
  insertBatch: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe('AuditService', () => {
  it('calls repository.insert with the entry', () => {
    const repo = makeRepo();
    const service = new AuditService(repo);

    const entry: AuditLogEntry = {
      action: 'AUTH_LOGIN_SUCCESS',
      actorType: 'user',
      actorId: 42,
      ip: '127.0.0.1',
    };

    service.log(entry);

    expect(repo.insert).toHaveBeenCalledWith(entry);
  });

  it('does not throw when repository.insert rejects', async () => {
    const repo = makeRepo({
      insert: jest.fn().mockRejectedValue(new Error('DB down')),
    });
    const service = new AuditService(repo);

    // Should not throw
    service.log({ action: 'TEST', actorType: 'system' });

    // Wait for the fire-and-forget promise to settle
    await new Promise((r) => setTimeout(r, 10));
  });

  it('calls repository.insertBatch for logBatch', () => {
    const repo = makeRepo();
    const service = new AuditService(repo);

    const entries: AuditLogEntry[] = [
      { action: 'A', actorType: 'user' },
      { action: 'B', actorType: 'system' },
    ];

    service.logBatch(entries);

    expect(repo.insertBatch).toHaveBeenCalledWith(entries);
  });

  it('skips insertBatch for empty array', () => {
    const repo = makeRepo();
    const service = new AuditService(repo);

    service.logBatch([]);

    expect(repo.insertBatch).not.toHaveBeenCalled();
  });

  it('does not throw when insertBatch rejects', async () => {
    const repo = makeRepo({
      insertBatch: jest.fn().mockRejectedValue(new Error('DB down')),
    });
    const service = new AuditService(repo);

    service.logBatch([{ action: 'TEST', actorType: 'system' }]);

    await new Promise((r) => setTimeout(r, 10));
  });
});
