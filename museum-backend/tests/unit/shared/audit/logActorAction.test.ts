/**
 * UFR-022 red phase — PR-7 `AuditService.logActorAction()` helper.
 * RUN_ID: 2026-05-23-pr-7-logActorAction.
 *
 * Locks behaviour of the new helper BEFORE the green phase adds it. All
 * assertions are expected to FAIL pre-green because `logActorAction` does
 * not exist on `AuditService` yet (TS will compile via `as any` casts, but
 * the method call will throw `TypeError: ... is not a function`).
 *
 * Spec sources of truth:
 *   .claude/skills/team/team-state/2026-05-23-pr-7-logActorAction/spec.md §4 (R1,R3,R5) §8.1
 *   .claude/skills/team/team-state/2026-05-23-pr-7-logActorAction/design.md §2.1 §2.3 §2.4
 *
 * Frozen-test discipline (UFR-022): this file is sha256-hashed in
 * `red-test-manifest.json`. Green phase MUST NOT modify it. If a test is
 * genuinely wrong, green emits `BLOCK-TEST-WRONG <file>:<line> <reason>`
 * and orchestrator re-spawns fresh red.
 */
import { AuditService } from '@shared/audit/audit.service';
import { BREACH_EVENTS } from '@shared/audit/breach-event-types';

import { makeAuditRepo } from '../../../helpers/audit/repo.fixtures';

import type { LogActorActionInput } from '@shared/audit/audit.service';
import type { AuditLogEntry } from '@shared/audit/audit.types';

describe('AuditService.logActorAction — UFR-022 red (PR-7)', () => {
  // ──────────────────────────────────────────────────────────────────────
  // R1 / AC4 — forces `actorType: 'user'` regardless of caller
  // ──────────────────────────────────────────────────────────────────────
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

  // ──────────────────────────────────────────────────────────────────────
  // R1 / AC5 — null-coerces `ip` when caller omits it
  // ──────────────────────────────────────────────────────────────────────
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
      // ip omitted → must end up as null
    });

    const insertedEntry = (repo.insert as jest.Mock).mock.calls[0]?.[0] as AuditLogEntry;
    expect(insertedEntry.ip).toBeNull();
  });

  // ──────────────────────────────────────────────────────────────────────
  // R1 / AC5 — null-coerces `requestId` when caller omits it
  // ──────────────────────────────────────────────────────────────────────
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
      // requestId omitted → must end up as null
    });

    const insertedEntry = (repo.insert as jest.Mock).mock.calls[0]?.[0] as AuditLogEntry;
    expect(insertedEntry.requestId).toBeNull();
  });

  // ──────────────────────────────────────────────────────────────────────
  // R1 — explicit ip + requestId pass through verbatim
  // ──────────────────────────────────────────────────────────────────────
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

  // ──────────────────────────────────────────────────────────────────────
  // R1 / R5 — delegates to AuditService.log() (proves spy reaches log())
  // ──────────────────────────────────────────────────────────────────────
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

    // delegation contract: log() invoked exactly once with the canonicalized entry
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

  // ──────────────────────────────────────────────────────────────────────
  // R5 / AC6 — inherits BREACH_EVENT_SET guard via delegation
  // ──────────────────────────────────────────────────────────────────────
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

  // ──────────────────────────────────────────────────────────────────────
  // R1 — return Promise<void>
  // ──────────────────────────────────────────────────────────────────────
  it('returns Promise<void>', async () => {
    const repo = makeAuditRepo();
    const service = new AuditService(repo) as AuditService & {
      logActorAction: (input: LogActorActionInput) => Promise<void>;
    };

    const result = service.logActorAction({
      action: 'AUTH_LOGIN_SUCCESS',
      actorId: 42,
    });

    // Helper MUST return a Promise (thenable).
    expect(typeof (result as Promise<unknown>).then).toBe('function');

    const awaited = await result;
    expect(awaited).toBeUndefined();
  });

  // ──────────────────────────────────────────────────────────────────────
  // R-2 / Q1 — compile-time exclusion of `actorType` from input shape
  // ──────────────────────────────────────────────────────────────────────
  // Smoke runtime assertion (the real check is the @ts-expect-error below):
  // caller passing actorType:'system' via `as any` MUST still see 'user' on
  // the persisted row (helper forces it regardless).
  it('compile-time: LogActorActionInput excludes the `actorType` field', async () => {
    const repo = makeAuditRepo();
    const service = new AuditService(repo) as AuditService & {
      logActorAction: (input: LogActorActionInput) => Promise<void>;
    };

    // TS 5.9 surfaces TS2353 ("excess property") at the property line, not at
    // the variable declaration. The directive MUST sit immediately before the
    // offending property so the suppression lines up with the diagnostic; if
    // green phase exposes `actorType` on the interface, the directive becomes
    // unused and TypeScript emits TS2578 → test compile fails → caught by reviewer.
    const bad: LogActorActionInput = {
      action: 'AUTH_LOGIN_SUCCESS',
      actorId: 1,
      // @ts-expect-error — `actorType` MUST NOT be assignable to LogActorActionInput.
      actorType: 'system',
    };

    // Runtime belt-and-braces: even when forced via `as any`, persisted row is 'user'.
    await service.logActorAction(bad as any);

    const insertedEntry = (repo.insert as jest.Mock).mock.calls[0]?.[0] as AuditLogEntry;
    expect(insertedEntry.actorType).toBe('user');
  });
});
