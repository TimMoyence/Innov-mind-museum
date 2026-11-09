import { AuditService } from '@shared/audit/audit.service';
import { BREACH_EVENTS } from '@shared/audit/breach-event-types';

import { makeAuditRepo } from '../../../helpers/audit/repo.fixtures';

import type { LogActorActionInput } from '@shared/audit/audit.service';
import type { AuditLogEntry } from '@shared/audit/audit.types';

describe('AuditService.logActorAction — UFR-022 red (PR-7)', () => {
  it('forces actorType:"user" on the persisted entry', async () => {
    const repo = makeAuditRepo();
    const service = new AuditService(repo) as AuditService & {
      logActorAction: (input: LogActorActionInput) => Promise<void>;
    };

    await service.logActorAction({
      action: 'AUTH_LOGIN_SUCCESS',
      actorId: 42,
    });

    const insertedEntry = (repo.insert as jest.Mock).mock.calls[0]?.[0] as AuditLogEntry;
    expect(insertedEntry).toBeDefined();
    expect(insertedEntry.actorType).toBe('user');
  });

  it('null-coerces ip from undefined to null', async () => {
    const repo = makeAuditRepo();
    const service = new AuditService(repo) as AuditService & {
      logActorAction: (input: LogActorActionInput) => Promise<void>;
    };

    await service.logActorAction({
      action: 'ADMIN_USER_SUSPENDED',
      actorId: 1,
      targetType: 'user',
      targetId: '7',
      metadata: { reason: 'test' },
    });

    const insertedEntry = (repo.insert as jest.Mock).mock.calls[0]?.[0] as AuditLogEntry;
    expect(insertedEntry.ip).toBeNull();
  });

  it('null-coerces requestId from undefined to null', async () => {
    const repo = makeAuditRepo();
    const service = new AuditService(repo) as AuditService & {
      logActorAction: (input: LogActorActionInput) => Promise<void>;
    };

    await service.logActorAction({
      action: 'ADMIN_USER_SUSPENDED',
      actorId: 1,
      targetType: 'user',
      targetId: '7',
      metadata: { reason: 'test' },
    });

    const insertedEntry = (repo.insert as jest.Mock).mock.calls[0]?.[0] as AuditLogEntry;
    expect(insertedEntry.requestId).toBeNull();
  });

  it('passes ip and requestId through verbatim when provided', async () => {
    const repo = makeAuditRepo();
    const service = new AuditService(repo) as AuditService & {
      logActorAction: (input: LogActorActionInput) => Promise<void>;
    };

    await service.logActorAction({
      action: 'ADMIN_USER_DELETED',
      actorId: 5,
      targetType: 'user',
      targetId: '99',
      metadata: { reason: 'gdpr' },
      ip: '203.0.113.7',
      requestId: 'req_abc123',
    });

    const insertedEntry = (repo.insert as jest.Mock).mock.calls[0]?.[0] as AuditLogEntry;
    expect(insertedEntry.ip).toBe('203.0.113.7');
    expect(insertedEntry.requestId).toBe('req_abc123');
  });

  it('delegates to AuditService.log() (not directly to repository.insert)', async () => {
    const repo = makeAuditRepo();
    const service = new AuditService(repo) as AuditService & {
      logActorAction: (input: LogActorActionInput) => Promise<void>;
    };
    const logSpy = jest.spyOn(service, 'log');

    await service.logActorAction({
      action: 'ADMIN_REPORT_RESOLVED',
      actorId: 3,
      targetType: 'message_report',
      targetId: 'rep_42',
      metadata: { status: 'reviewed' },
      ip: '198.51.100.4',
      requestId: 'req_xyz',
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const delegated = logSpy.mock.calls[0]?.[0];
    expect(delegated).toBeDefined();
    expect(delegated).toMatchObject({
      action: 'ADMIN_REPORT_RESOLVED',
      actorType: 'user',
      actorId: 3,
      targetType: 'message_report',
      targetId: 'rep_42',
      metadata: { status: 'reviewed' },
      ip: '198.51.100.4',
      requestId: 'req_xyz',
    });
  });

  it('inherits the breach_* guard: refuses a BREACH_EVENT, no repo.insert call', async () => {
    const repo = makeAuditRepo();
    const service = new AuditService(repo) as AuditService & {
      logActorAction: (input: LogActorActionInput) => Promise<void>;
    };

    await service.logActorAction({
      action: BREACH_EVENTS.JWT_SECRET_LEAKED,
      actorId: 1,
    });

    expect(repo.insert).not.toHaveBeenCalled();
  });

  it('returns Promise<void>', async () => {
    const repo = makeAuditRepo();
    const service = new AuditService(repo) as AuditService & {
      logActorAction: (input: LogActorActionInput) => Promise<void>;
    };

    const result = service.logActorAction({
      action: 'AUTH_LOGIN_SUCCESS',
      actorId: 42,
    });

    expect(typeof (result as Promise<unknown>).then).toBe('function');

    const awaited = await result;
    expect(awaited).toBeUndefined();
  });

  it('compile-time: LogActorActionInput excludes the `actorType` field', async () => {
    const repo = makeAuditRepo();
    const service = new AuditService(repo) as AuditService & {
      logActorAction: (input: LogActorActionInput) => Promise<void>;
    };

    const acceptsActorType: 'actorType' extends keyof LogActorActionInput ? true : false = false;
    expect(acceptsActorType).toBe(false);

    const bad = { action: 'AUTH_LOGIN_SUCCESS', actorId: 1, actorType: 'system' };

    await service.logActorAction(bad as LogActorActionInput);

    const insertedEntry = (repo.insert as jest.Mock).mock.calls[0]?.[0] as AuditLogEntry;
    expect(insertedEntry.actorType).toBe('user');
  });
});
