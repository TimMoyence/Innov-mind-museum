import type { AdminUserDTO } from '@/lib/admin-types';

export const makeAdminUser = (overrides: Partial<AdminUserDTO> = {}): AdminUserDTO => ({
  id: 1,
  email: 'user@test.com',
  firstname: 'Test',
  lastname: 'User',
  role: 'visitor',
  museumId: null,
  emailVerified: true,
  suspended: false,
  deletedAt: null,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-06-01T00:00:00Z',
  ...overrides,
});
