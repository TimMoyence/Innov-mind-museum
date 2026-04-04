import type { IAuditLogRepository } from '@shared/audit/audit.repository.interface';

/** Shared mock IAuditLogRepository factory. */
export const makeAuditRepo = (
  overrides: Partial<IAuditLogRepository> = {},
): IAuditLogRepository => ({
  insert: jest.fn().mockResolvedValue(undefined),
  insertBatch: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});
