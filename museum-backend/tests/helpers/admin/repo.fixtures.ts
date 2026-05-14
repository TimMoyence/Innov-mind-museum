import type { IAdminRepository } from '@modules/admin/domain/admin/admin.repository.interface';

/** Shared mock IAdminRepository factory. */
export const makeAdminRepo = (overrides: Partial<IAdminRepository> = {}): IAdminRepository => ({
  listUsers: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
  getUserById: jest.fn().mockResolvedValue(null),
  changeUserRole: jest.fn().mockResolvedValue(null),
  suspendUser: jest.fn().mockResolvedValue(null),
  unsuspendUser: jest.fn().mockResolvedValue(null),
  softDeleteUser: jest.fn().mockResolvedValue(null),
  countAdmins: jest.fn().mockResolvedValue(0),
  listAuditLogs: jest
    .fn()
    .mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
  getStats: jest.fn(),
  listReports: jest
    .fn()
    .mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
  resolveReport: jest.fn().mockResolvedValue(null),
  getUsageAnalytics: jest.fn(),
  getContentAnalytics: jest.fn(),
  getEngagementAnalytics: jest.fn(),
  ...overrides,
});
