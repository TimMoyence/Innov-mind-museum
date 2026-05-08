import { AuditService } from '@shared/audit/audit.service';
import type { AuditLogEntry } from '@shared/audit/audit.types';
import { BREACH_EVENTS } from '@shared/audit/breach-event-types';
import { logger } from '@shared/logger/logger';
import { makeAuditRepo } from '../../helpers/audit/repo.fixtures';

describe('AuditService', () => {
  it('calls repository.insert with the entry', () => {
    const repo = makeAuditRepo();
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
    const repo = makeAuditRepo({
      insert: jest.fn().mockRejectedValue(new Error('DB down')),
    });
    const service = new AuditService(repo);

    // Should not throw
    service.log({ action: 'TEST', actorType: 'system' });

    // Wait for the fire-and-forget promise to settle
    await new Promise((r) => setTimeout(r, 10));
  });

  it('calls repository.insertBatch for logBatch', () => {
    const repo = makeAuditRepo();
    const service = new AuditService(repo);

    const entries: AuditLogEntry[] = [
      { action: 'A', actorType: 'user' },
      { action: 'B', actorType: 'system' },
    ];

    service.logBatch(entries);

    expect(repo.insertBatch).toHaveBeenCalledWith(entries);
  });

  it('skips insertBatch for empty array', () => {
    const repo = makeAuditRepo();
    const service = new AuditService(repo);

    service.logBatch([]);

    expect(repo.insertBatch).not.toHaveBeenCalled();
  });

  it('does not throw when insertBatch rejects', async () => {
    const repo = makeAuditRepo({
      insertBatch: jest.fn().mockRejectedValue(new Error('DB down')),
    });
    const service = new AuditService(repo);

    service.logBatch([{ action: 'TEST', actorType: 'system' }]);

    await new Promise((r) => setTimeout(r, 10));
  });

  it('logs non-Error rejection from insert as string', async () => {
    const repo = makeAuditRepo({
      insert: jest.fn().mockRejectedValue('string error'),
    });
    const service = new AuditService(repo);

    service.log({ action: 'TEST', actorType: 'system' });

    await new Promise((r) => setTimeout(r, 10));
    // Should not throw; the catch handler converts non-Error to String()
  });

  it('logs non-Error rejection from insertBatch as string', async () => {
    const repo = makeAuditRepo({
      insertBatch: jest.fn().mockRejectedValue(42),
    });
    const service = new AuditService(repo);

    service.logBatch([{ action: 'TEST', actorType: 'system' }]);

    await new Promise((r) => setTimeout(r, 10));
  });

  it('proceeds to repository.insert for a non-breach action (BREACH_EVENT_SET guard happy path)', async () => {
    const repo = makeAuditRepo();
    const service = new AuditService(repo);

    const entry: AuditLogEntry = {
      action: 'AUTH_LOGIN_SUCCESS',
      actorType: 'user',
      actorId: 1,
    };

    await service.log(entry);

    expect(repo.insert).toHaveBeenCalledTimes(1);
    expect(repo.insert).toHaveBeenCalledWith(entry);
  });

  it('treats omitted reporterUserId (undefined) as a system actor via `== null` (kills `==`→`===` mutant)', async () => {
    const repo = makeAuditRepo();
    const service = new AuditService(repo);

    // reporterUserId omitted → undefined.
    // Real `undefined == null` → true → 'system'.
    // Mutant `undefined === null` → false → 'user'. Mutant dies.
    await service.auditCriticalSecurityEvent({
      eventName: BREACH_EVENTS.JWT_SECRET_LEAKED,
      severity: 'P1',
      detectedAt: new Date('2026-05-01T00:00:00Z'),
      detectionSource: 'sentry',
      affectedDataClasses: ['account'],
      containmentStatus: 'in_progress',
      description: 'redacted',
    });

    const insertCall = (repo.insert as jest.Mock).mock.calls[0]?.[0] as AuditLogEntry;
    expect(insertCall.actorType).toBe('system');
    expect(insertCall.actorId).toBeNull();

    // Cross-check: an explicit numeric reporterUserId routes to 'user'.
    (repo.insert as jest.Mock).mockClear();
    await service.auditCriticalSecurityEvent({
      eventName: BREACH_EVENTS.JWT_SECRET_LEAKED,
      severity: 'P1',
      detectedAt: new Date('2026-05-01T00:00:00Z'),
      detectionSource: 'sentry',
      affectedDataClasses: ['account'],
      containmentStatus: 'in_progress',
      reporterUserId: 42,
      description: 'redacted',
    });
    const insertCall2 = (repo.insert as jest.Mock).mock.calls[0]?.[0] as AuditLogEntry;
    expect(insertCall2.actorType).toBe('user');
    expect(insertCall2.actorId).toBe(42);
  });

  it('logs the literal "audit_log_batch_failed" key when insertBatch rejects (kills BlockStatement→{} L135-141 + StringLiteral→"" L136)', async () => {
    // Kills 2 Stryker survivors at once:
    //   - L135 BlockStatement→{}: catch body emptied → no logger.error call
    //   - L136 StringLiteral→"": logger.error called with empty string instead
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    try {
      const repo = makeAuditRepo({
        insertBatch: jest.fn().mockRejectedValue(new Error('DB down')),
      });
      const service = new AuditService(repo);

      await service.logBatch([{ action: 'TEST_BATCH', actorType: 'system' }]);

      // Assert exact literal — neither "" (StringLiteral mutant) nor missing call
      // (BlockStatement mutant) would satisfy this.
      expect(errorSpy).toHaveBeenCalledWith(
        'audit_log_batch_failed',
        expect.objectContaining({
          count: 1,
          error: 'DB down',
        }),
      );
      // Belt-and-braces: ensure the empty-string mutant cannot pass by accident.
      const keys = errorSpy.mock.calls.map((call) => call[0]);
      expect(keys).toContain('audit_log_batch_failed');
      expect(keys).not.toContain('');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('logs the literal "audit_breach_insert_failed" key when persisting the breach row fails (kills StringLiteral→"" L205)', async () => {
    // Kills the L205 StringLiteral survivor: the log key when the breach
    // insert path catches a rejection. Mutant "" would emit an empty key
    // which our SOC2 audit pipeline can't grep for.
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    try {
      const repo = makeAuditRepo({
        insert: jest.fn().mockRejectedValue(new Error('chain locked')),
      });
      const service = new AuditService(repo);

      await service.auditCriticalSecurityEvent({
        eventName: BREACH_EVENTS.JWT_SECRET_LEAKED,
        severity: 'P1',
        detectedAt: new Date('2026-05-01T00:00:00Z'),
        detectionSource: 'sentry',
        affectedDataClasses: ['account'],
        containmentStatus: 'in_progress',
        description: 'redacted',
      });

      expect(errorSpy).toHaveBeenCalledWith(
        'audit_breach_insert_failed',
        expect.objectContaining({
          action: BREACH_EVENTS.JWT_SECRET_LEAKED,
          severity: 'P1',
          error: 'chain locked',
        }),
      );
      const keys = errorSpy.mock.calls.map((call) => call[0]);
      expect(keys).toContain('audit_breach_insert_failed');
      expect(keys).not.toContain('');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('persists schemaVersion exactly equal to 1 on the breach metadata (kills NumberLiteral mutants)', async () => {
    const repo = makeAuditRepo();
    const service = new AuditService(repo);

    await service.auditCriticalSecurityEvent({
      eventName: BREACH_EVENTS.DB_COMPROMISE,
      severity: 'P0',
      detectedAt: new Date('2026-05-01T00:00:00Z'),
      detectionSource: 'audit_anomaly',
      affectedDataClasses: ['account', 'chat_text'],
      containmentStatus: 'not_started',
      reporterUserId: 7,
      description: 'redacted',
    });

    const insertCall = (repo.insert as jest.Mock).mock.calls[0]?.[0] as AuditLogEntry;
    const breach = (insertCall.metadata as { breach: { schemaVersion: number } }).breach;
    expect(breach.schemaVersion).toBe(1);
    expect(breach.schemaVersion).not.toBe(0);
    expect(breach.schemaVersion).not.toBe(2);
  });
});
