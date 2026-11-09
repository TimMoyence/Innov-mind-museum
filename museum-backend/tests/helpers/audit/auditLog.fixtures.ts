import { AuditLog } from '@shared/audit/auditLog.entity';

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
