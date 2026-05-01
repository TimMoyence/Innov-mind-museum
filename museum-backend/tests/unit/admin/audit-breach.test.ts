/**
 * Integration test for the breach (GDPR Art 33-34) audit pipeline (R6 / W1.T5).
 *
 * Verifies that {@link AuditService.auditCriticalSecurityEvent}:
 *   1. Writes a hash-chain-friendly row through the existing repository port
 *      with `metadata.breach` carrying the typed payload (no schema change).
 *   2. Computes the CNIL 72h deadline correctly.
 *   3. Tags Sentry so the existing alerting catches the breach.
 *   4. Refuses free-form `breach_*` actions on `log()` / `logBatch()`.
 *   5. Does not break the audit hash chain when surrounded by normal rows
 *      (parity check via the canonical `computeRowHash` helper).
 *   6. Plays well with the IP anonymization contract: `ip` lives outside
 *      the chain payload, so it can be rewritten without invalidating the
 *      row hash.
 */

import * as Sentry from '@sentry/node';

import {
  AuditService,
  BREACH_EVENTS,
  computeRowHash,
  verifyAuditChain,
  type BreachAuditEvent,
} from '@shared/audit';

import { makeAuditRepo } from '../../helpers/audit/repo.fixtures';
import { makeChainRow } from '../../helpers/audit/chain.fixtures';

import type { AuditLogEntry } from '@shared/audit';
import type { AuditChainRow } from '@shared/audit';

interface SentryScopeStub {
  setTag: jest.Mock;
  setLevel: jest.Mock;
  setContext: jest.Mock;
}

interface SentryCall {
  msg: string;
  scope: SentryScopeStub;
}

let lastSentryCall: SentryCall | null = null;
let activeScope: SentryScopeStub | null = null;

// Spy on Sentry without replacing the SDK — `withScope` + `captureMessage`
// are the two methods the helper uses; both no-op when Sentry is not init'd.
jest.mock('@sentry/node', () => ({
  withScope: jest.fn((cb: (scope: SentryScopeStub) => void) => {
    activeScope = {
      setTag: jest.fn(),
      setLevel: jest.fn(),
      setContext: jest.fn(),
    };
    cb(activeScope);
  }),
  captureMessage: jest.fn((msg: string) => {
    if (activeScope) {
      lastSentryCall = { msg, scope: activeScope };
    }
  }),
}));

beforeEach(() => {
  lastSentryCall = null;
  activeScope = null;
  (Sentry.withScope as jest.Mock).mockClear();
  (Sentry.captureMessage as jest.Mock).mockClear();
});

const detectedAt = new Date('2026-04-26T08:00:00.000Z');
const expectedCnilDeadline = '2026-04-29T08:00:00.000Z';

const makeBreachEvent = (overrides: Partial<BreachAuditEvent> = {}): BreachAuditEvent => ({
  eventName: BREACH_EVENTS.JWT_SECRET_LEAKED,
  severity: 'P0',
  detectedAt,
  detectionSource: 'sentry',
  affectedDataClasses: ['account'],
  containmentStatus: 'in_progress',
  reporterUserId: null,
  description: 'JWT_ACCESS_SECRET found in public CI log artifact',
  ...overrides,
});

describe('AuditService.auditCriticalSecurityEvent', () => {
  it('writes a breach row through the repository with the typed payload + computes CNIL deadline', async () => {
    const repo = makeAuditRepo();
    const service = new AuditService(repo);

    const result = await service.auditCriticalSecurityEvent(makeBreachEvent());

    expect(result.cnilDeadline).toBe(expectedCnilDeadline);
    expect(result.auditId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    expect(repo.insert).toHaveBeenCalledTimes(1);
    const entry = (repo.insert as jest.Mock).mock.calls[0][0] as AuditLogEntry;

    expect(entry.action).toBe(BREACH_EVENTS.JWT_SECRET_LEAKED);
    expect(entry.actorType).toBe('system'); // reporterUserId == null → system-detected
    expect(entry.actorId).toBeNull();
    expect(entry.targetType).toBe('breach');
    expect(entry.targetId).toBe(result.auditId);

    // Typed payload nested under metadata.breach — no schema change required.
    const meta = entry.metadata as { breach: Record<string, unknown> };
    expect(meta.breach).toMatchObject({
      auditId: result.auditId,
      severity: 'P0',
      detectedAt: detectedAt.toISOString(),
      detectionSource: 'sentry',
      affectedDataClasses: ['account'],
      containmentStatus: 'in_progress',
      description: 'JWT_ACCESS_SECRET found in public CI log artifact',
      cnilDeadline: expectedCnilDeadline,
      schemaVersion: 1,
    });
  });

  it('flags reporter actor when the breach was user-reported', async () => {
    const repo = makeAuditRepo();
    const service = new AuditService(repo);

    await service.auditCriticalSecurityEvent(
      makeBreachEvent({
        eventName: BREACH_EVENTS.OAUTH_BYPASS,
        severity: 'P1',
        detectionSource: 'user_report',
        reporterUserId: 4242,
        ip: '203.0.113.7',
      }),
    );

    const entry = (repo.insert as jest.Mock).mock.calls[0][0] as AuditLogEntry;
    expect(entry.actorType).toBe('user');
    expect(entry.actorId).toBe(4242);
    expect(entry.ip).toBe('203.0.113.7'); // IP lives outside the chain payload → 13mo anonymizer-safe
  });

  it('tags Sentry with severity=breach + event + auditId so existing alerting fires', async () => {
    const repo = makeAuditRepo();
    const service = new AuditService(repo);

    const { auditId } = await service.auditCriticalSecurityEvent(makeBreachEvent());

    expect(Sentry.withScope).toHaveBeenCalledTimes(1);
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(lastSentryCall?.msg).toContain('[BREACH P0]');
    expect(lastSentryCall?.msg).toContain(BREACH_EVENTS.JWT_SECRET_LEAKED);
    expect(lastSentryCall?.msg).toContain(auditId);

    const setTag = lastSentryCall!.scope.setTag;
    const tagPairs = setTag.mock.calls.map(([k, v]: [string, string]) => `${k}=${v}`);
    expect(tagPairs).toEqual(
      expect.arrayContaining([
        'severity=breach',
        `event=${BREACH_EVENTS.JWT_SECRET_LEAKED}`,
        `auditId=${auditId}`,
        'breachSeverity=P0',
        'detectionSource=sentry',
      ]),
    );

    expect(lastSentryCall!.scope.setLevel).toHaveBeenCalledWith('fatal'); // P0 → fatal
  });

  it('downgrades Sentry level for P1 breaches', async () => {
    const repo = makeAuditRepo();
    const service = new AuditService(repo);

    await service.auditCriticalSecurityEvent(makeBreachEvent({ severity: 'P1' }));
    expect(lastSentryCall!.scope.setLevel).toHaveBeenCalledWith('error');
  });

  it('still emits Sentry when the audit insert fails (alerting must not be blocked)', async () => {
    const repo = makeAuditRepo({
      insert: jest.fn().mockRejectedValue(new Error('DB down')),
    });
    const service = new AuditService(repo);

    const result = await service.auditCriticalSecurityEvent(makeBreachEvent());

    expect(result.cnilDeadline).toBe(expectedCnilDeadline);
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
  });

  it('refuses unknown event names (defends against `as any` callers)', async () => {
    const repo = makeAuditRepo();
    const service = new AuditService(repo);

    await expect(
      service.auditCriticalSecurityEvent({
        ...makeBreachEvent(),
        eventName: 'breach_made_up' as 'breach_jwt_secret_leaked',
      }),
    ).rejects.toThrow(/unknown breach event/);

    expect(repo.insert).not.toHaveBeenCalled();
  });
});

describe('AuditService.log() / logBatch() — breach-event guard', () => {
  it('refuses free-form breach_* writes via log() and never calls the repo', async () => {
    const repo = makeAuditRepo();
    const service = new AuditService(repo);

    await service.log({
      action: BREACH_EVENTS.DB_COMPROMISE,
      actorType: 'system',
    });

    expect(repo.insert).not.toHaveBeenCalled();
  });

  it('refuses the entire batch when any row carries a breach action', async () => {
    const repo = makeAuditRepo();
    const service = new AuditService(repo);

    await service.logBatch([
      { action: 'AUTH_LOGIN_SUCCESS', actorType: 'user' },
      { action: BREACH_EVENTS.S3_LEAK, actorType: 'system' },
    ]);

    expect(repo.insertBatch).not.toHaveBeenCalled();
  });
});

describe('audit hash chain — breach row parity', () => {
  it('a breach row sandwiched between normal rows verifies cleanly via verifyAuditChain', () => {
    // Build chain: [normal, breach, normal] using the same hash logic the
    // PG repository applies. The IP column is intentionally NOT part of the
    // chain payload — verified separately in `audit-chain.ts`.
    const row1 = makeChainRow({
      id: '00000000-0000-0000-0000-000000000001',
      action: 'AUTH_LOGIN_SUCCESS',
      actorId: 1,
      createdAt: new Date('2026-04-26T07:59:00.000Z'),
    });

    // Breach row: action = canonical event name, metadata = the typed payload
    // exactly as the service would produce it.
    const breachAuditId = '11111111-1111-1111-1111-111111111111';
    const breachMetadata = {
      breach: {
        auditId: breachAuditId,
        severity: 'P0',
        detectedAt: detectedAt.toISOString(),
        detectionSource: 'sentry',
        affectedDataClasses: ['account'],
        containmentStatus: 'in_progress',
        description: 'JWT_ACCESS_SECRET found in public CI log artifact',
        cnilDeadline: expectedCnilDeadline,
        schemaVersion: 1,
      },
    };

    const row2: AuditChainRow = (() => {
      const base = {
        id: '00000000-0000-0000-0000-000000000002',
        actorId: null,
        action: BREACH_EVENTS.JWT_SECRET_LEAKED,
        targetType: 'breach',
        targetId: breachAuditId,
        metadata: breachMetadata as Record<string, unknown>,
        createdAt: new Date('2026-04-26T08:00:00.000Z'),
        prevHash: row1.rowHash,
      };
      return { ...base, rowHash: computeRowHash(base, base.prevHash) };
    })();

    const row3: AuditChainRow = (() => {
      const base = {
        id: '00000000-0000-0000-0000-000000000003',
        actorId: 1,
        action: 'AUTH_LOGOUT',
        targetType: null,
        targetId: null,
        metadata: null,
        createdAt: new Date('2026-04-26T08:01:00.000Z'),
        prevHash: row2.rowHash,
      };
      return { ...base, rowHash: computeRowHash(base, base.prevHash) };
    })();

    const result = verifyAuditChain([row1, row2, row3]);
    expect(result.valid).toBe(true);
    expect(result.firstBreakAt).toBeNull();
    expect(result.checked).toBe(3);
  });

  it('mutating only the IP would not break the chain (anonymizer-safe)', () => {
    // The repository writes `ip` to the row but excludes it from the
    // hash payload. Re-running computeRowHash without considering `ip`
    // is the contract the IP anonymizer relies on. We pin it here so a
    // future refactor that pulls `ip` into the payload triggers a red.
    const breachRow: AuditChainRow = makeChainRow({
      id: '22222222-2222-2222-2222-222222222222',
      action: BREACH_EVENTS.JWT_SECRET_LEAKED,
      actorId: null,
      metadata: { breach: { severity: 'P0' } } as Record<string, unknown>,
      createdAt: detectedAt,
    });

    // Pre-anon: rowHash already correct (helper ensures it).
    expect(verifyAuditChain([breachRow]).valid).toBe(true);

    // The IP isn't on AuditChainRow at all — proving it can't be in the payload.
    expect(Object.keys(breachRow)).not.toContain('ip');
  });
});
