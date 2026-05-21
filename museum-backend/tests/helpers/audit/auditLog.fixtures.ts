import { AuditLog } from '@shared/audit/auditLog.entity';

/**
 * GDPR DSAR (B3) — factory for the `AuditLog` ENTITY (distinct from
 * `makeChainRow` in `chain.fixtures.ts`, which builds the hash-chain row shape).
 * Used by the `listForActor` repo test + the DSAR completeness test. The export
 * DTO MUST exclude `prevHash` / `rowHash` (R14, D4); the factory seeds them so
 * the test can assert their ABSENCE.
 * @param overrides - Partial entity override merged on top of the defaults.
 */
export function makeAuditLogEntity(overrides: Partial<AuditLog> = {}): AuditLog {
  return Object.assign(new AuditLog(), {
    id: '00000000-0000-0000-0000-0000000000a1',
    action: 'ACCOUNT_DELETED',
    actorType: 'user',
    actorId: 42,
    targetType: 'user',
    targetId: '42',
    metadata: { reason: 'self-service' },
    ip: '203.0.113.42',
    requestId: '00000000-0000-0000-0000-0000000000b2',
    prevHash: 'a'.repeat(64),
    rowHash: 'b'.repeat(64),
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    ...overrides,
  });
}
