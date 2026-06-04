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

import { createHash } from 'node:crypto';

import * as Sentry from '@sentry/node';

import {
  AUDIT_CHAIN_GENESIS_HASH,
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

/**
 * INDEPENDENT oracle (AC5 / AC6) — deep canonical serializer, hand-written, NOT
 * the production fn and NOT `JSON.stringify(meta, Object.keys(meta).sort())`. Keys
 * sorted by code unit at every level, arrays order-preserved.
 * @param v value to serialize
 * @returns canonical deep-sorted JSON
 */
function oracleCanonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(oracleCanonical).join(',') + ']';
  const entries = Object.entries(v as Record<string, unknown>);
  entries.sort(([a], [b]) => {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });
  return (
    '{' + entries.map(([k, val]) => JSON.stringify(k) + ':' + oracleCanonical(val)).join(',') + '}'
  );
}

/** Fields an oracle needs to reproduce a row hash (mirrors AuditChainInput). */
interface OracleInput {
  id: string;
  actorId: number | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

/**
 * Independent oracle for a row's rowHash — mirrors the CORRECT (post-fix) hash a
 * row SHOULD carry: full deep serialization of metadata. Used to forge the breach
 * row's stored rowHash WITHOUT calling the (buggy) production `computeRowHash`, so
 * `verifyAuditChain` is the only thing under test (AC6).
 * @param input the chain input fields
 * @param prevHash previous row hash
 * @returns the expected SHA-256 hex digest
 */
function oracleRowHash(input: OracleInput, prevHash: string): string {
  const metadataJson = input.metadata === null ? '' : oracleCanonical(input.metadata);
  const payload = [
    input.id,
    input.actorId ?? '',
    input.action,
    input.targetType ?? '',
    input.targetId ?? '',
    metadataJson,
    input.createdAt.toISOString(),
    prevHash,
  ].join('|');
  return createHash('sha256').update(payload).digest('hex');
}

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

/**
 * Legacy v1 (buggy, FROZEN) metadata serializer — top-level keys only, nested
 * objects collapse to `{}`. Models exactly what the OLD `computeRowHash` produced
 * for historical rows. Used ONLY to forge a realistic legacy row hash for AC7.
 * @param meta metadata object
 * @returns the legacy (top-level-only) JSON string
 */
function legacyV1MetadataJson(meta: Record<string, unknown>): string {
  return JSON.stringify(
    meta,
    Object.keys(meta).sort((a, b) => a.localeCompare(b)),
  );
}

/**
 * Forge a stored rowHash the way a row of the given hashVersion SHOULD carry it:
 * v1 = legacy top-level-only serializer, v2 = full deep canonical (oracleCanonical).
 * Independent of the production `computeRowHash` (AC6/AC7 oracle independence).
 * @param input chain input fields
 * @param prevHash previous row hash
 * @param hashVersion 1 (legacy) or 2 (deep canonical)
 * @returns the expected SHA-256 hex digest for that version
 */
function oracleRowHashForVersion(input: OracleInput, prevHash: string, hashVersion: 1 | 2): string {
  let metadataJson = '';
  if (input.metadata !== null) {
    metadataJson =
      hashVersion === 1 ? legacyV1MetadataJson(input.metadata) : oracleCanonical(input.metadata);
  }
  const payload = [
    input.id,
    input.actorId ?? '',
    input.action,
    input.targetType ?? '',
    input.targetId ?? '',
    metadataJson,
    input.createdAt.toISOString(),
    prevHash,
  ].join('|');
  return createHash('sha256').update(payload).digest('hex');
}

describe('audit hash chain — nested-metadata tamper-evidence (AUDIT-01 / TD-61)', () => {
  const breachAuditId = '33333333-3333-3333-3333-333333333333';

  /**
   * Build a [normal, breach(v2), normal] chain where the breach row's stored
   * rowHash comes from the INDEPENDENT oracle (full deep serialization), NOT from
   * the production computeRowHash. `verifyAuditChain` is the only thing under test.
   * @param breachMetadata the metadata payload for the breach row
   * @returns the 3-row chain
   */
  function buildChainWithBreach(breachMetadata: Record<string, unknown>): AuditChainRow[] {
    const row1 = makeChainRow({
      id: '00000000-0000-0000-0000-0000000000c1',
      action: 'AUTH_LOGIN_SUCCESS',
      actorId: 1,
      createdAt: new Date('2026-04-26T07:59:00.000Z'),
    });

    const breachBase = {
      id: '00000000-0000-0000-0000-0000000000c2',
      actorId: null,
      action: BREACH_EVENTS.JWT_SECRET_LEAKED,
      targetType: 'breach',
      targetId: breachAuditId,
      metadata: breachMetadata,
      createdAt: new Date('2026-04-26T08:00:00.000Z'),
      prevHash: row1.rowHash,
    };
    const row2: AuditChainRow = {
      ...breachBase,
      rowHash: oracleRowHash(breachBase, breachBase.prevHash),
    };

    const tailBase = {
      id: '00000000-0000-0000-0000-0000000000c3',
      actorId: 1,
      action: 'AUTH_LOGOUT',
      targetType: null,
      targetId: null,
      metadata: null,
      createdAt: new Date('2026-04-26T08:01:00.000Z'),
      prevHash: row2.rowHash,
    };
    const row3: AuditChainRow = {
      ...tailBase,
      rowHash: oracleRowHash(tailBase, tailBase.prevHash),
    };

    return [row1, row2, row3];
  }

  const breachMetadata = (): Record<string, unknown> => ({
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
  });

  it('AC6 — mutating breach.severity (nested) breaks the chain at the breach row', () => {
    const rows = buildChainWithBreach(breachMetadata());

    // Baseline: the oracle-forged chain is intact only if computeRowHash serializes
    // nested metadata (deep). With the buggy runtime this already fails (the breach
    // row recompute ignores breach.{...}) → RED.
    expect(verifyAuditChain(rows).valid).toBe(true);

    // Mutate the nested severity P0 -> P2 WITHOUT recomputing the stored rowHash.
    const tampered = [...rows];
    const meta = JSON.parse(JSON.stringify(tampered[1].metadata)) as {
      breach: { severity: string };
    };
    meta.breach.severity = 'P2';
    tampered[1] = { ...tampered[1], metadata: meta as Record<string, unknown> };

    const result = verifyAuditChain(tampered);
    expect(result.valid).toBe(false);
    expect(result.firstBreakAt).toBe(1);
    expect(result.firstBreakId).toBe(tampered[1].id);
  });

  it('AC6 — mutating breach.description (nested) breaks the chain at the breach row', () => {
    const rows = buildChainWithBreach(breachMetadata());
    const tampered = [...rows];
    const meta = JSON.parse(JSON.stringify(tampered[1].metadata)) as {
      breach: { description: string };
    };
    meta.breach.description = 'totally different breach narrative';
    tampered[1] = { ...tampered[1], metadata: meta as Record<string, unknown> };

    const result = verifyAuditChain(tampered);
    expect(result.valid).toBe(false);
    expect(result.firstBreakAt).toBe(1);
  });

  it('AC7 — a mixed legacy(v1)+new(v2) chain verifies with no false BREAK', () => {
    // Legacy row: hashVersion 1, rowHash forged under the FROZEN v1 serializer
    // (nested collapses to {}). It carries nested metadata, exactly the historical
    // breach-row shape that the v1 hash never covered.
    const v1Base = {
      id: '00000000-0000-0000-0000-0000000000d1',
      actorId: null,
      action: BREACH_EVENTS.JWT_SECRET_LEAKED,
      targetType: 'breach',
      targetId: breachAuditId,
      metadata: breachMetadata(),
      createdAt: new Date('2026-03-01T08:00:00.000Z'),
      prevHash: AUDIT_CHAIN_GENESIS_HASH,
    };
    const v1Row: AuditChainRow = {
      ...v1Base,
      hashVersion: 1,
      rowHash: oracleRowHashForVersion(v1Base, v1Base.prevHash, 1),
    };

    // New row: hashVersion 2, rowHash under the deep canonical serializer.
    const v2Base = {
      id: '00000000-0000-0000-0000-0000000000d2',
      actorId: 1,
      action: 'AUTH_LOGIN_SUCCESS',
      targetType: 'user',
      targetId: '1',
      metadata: { breach: { severity: 'P1', count: 7 } } as Record<string, unknown>,
      createdAt: new Date('2026-06-04T08:00:00.000Z'),
      prevHash: v1Row.rowHash,
    };
    const v2Row: AuditChainRow = {
      ...v2Base,
      hashVersion: 2,
      rowHash: oracleRowHashForVersion(v2Base, v2Base.prevHash, 2),
    };

    // Legacy verified under v1 (no false positive), new under v2 → whole chain valid.
    const result = verifyAuditChain([v1Row, v2Row]);
    expect(result.valid).toBe(true);
    expect(result.checked).toBe(2);
  });

  it('AC7 — tampering a legacy(v1) row is still detected', () => {
    const v1Base = {
      id: '00000000-0000-0000-0000-0000000000e1',
      actorId: 5,
      action: 'AUTH_LOGIN_SUCCESS',
      targetType: 'user',
      targetId: '5',
      metadata: { reason: 'password' } as Record<string, unknown>,
      createdAt: new Date('2026-03-02T08:00:00.000Z'),
      prevHash: AUDIT_CHAIN_GENESIS_HASH,
    };
    const v1Row: AuditChainRow = {
      ...v1Base,
      hashVersion: 1,
      rowHash: oracleRowHashForVersion(v1Base, v1Base.prevHash, 1),
    };

    // Genuine alteration of a legacy row: mutate a top-level field without
    // recomputing the rowHash. Recompute under v1 must diverge → BREAK.
    const tampered: AuditChainRow = { ...v1Row, action: 'TAMPERED_ACTION' };

    const result = verifyAuditChain([tampered]);
    expect(result.valid).toBe(false);
    expect(result.firstBreakAt).toBe(0);
  });
});
