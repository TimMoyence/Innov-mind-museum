import { ChangeUserRoleUseCase } from '@modules/admin/useCase/changeUserRole.useCase';
import type { AdminUserDTO } from '@modules/admin/domain/admin.types';
import type { PaginatedResult } from '@shared/types/pagination';
import { AppError } from '@shared/errors/app.error';
import { makeAdminRepo } from '../../../helpers/admin/repo.fixtures';

// Mock the audit service module
jest.mock('@shared/audit', () => ({
  auditService: { log: jest.fn() },
  AUDIT_ADMIN_ROLE_CHANGE: 'ADMIN_ROLE_CHANGE',
}));

import { auditService } from '@shared/audit';

const makeUser = (overrides: Partial<AdminUserDTO> = {}): AdminUserDTO => ({
  id: 1,
  email: 'user@example.com',
  firstname: 'Test',
  lastname: 'User',
  role: 'visitor',
  emailVerified: true,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  ...overrides,
});

const makePaginatedAdmins = (admins: AdminUserDTO[]): PaginatedResult<AdminUserDTO> => ({
  data: admins,
  total: admins.length,
  page: 1,
  limit: 1,
  totalPages: 1,
});

describe('ChangeUserRoleUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects invalid role values', async () => {
    const repo = makeAdminRepo({
      changeUserRole: jest.fn().mockResolvedValue(makeUser({ role: 'moderator' })),
      countAdmins: jest.fn().mockResolvedValue(2),
    });
    const uc = new ChangeUserRoleUseCase(repo);

    await expect(uc.execute({ userId: 1, newRole: 'superadmin', actorId: 99 })).rejects.toThrow(
      AppError,
    );

    await expect(
      uc.execute({ userId: 1, newRole: 'superadmin', actorId: 99 }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('allows valid role values', async () => {
    const repo = makeAdminRepo({
      changeUserRole: jest.fn().mockResolvedValue(makeUser({ role: 'moderator' })),
      countAdmins: jest.fn().mockResolvedValue(2),
    });
    const uc = new ChangeUserRoleUseCase(repo);

    const result = await uc.execute({ userId: 1, newRole: 'moderator', actorId: 99 });

    expect(result.role).toBe('moderator');
    expect(repo.changeUserRole).toHaveBeenCalledWith(1, 'moderator');
  });

  it('prevents removing the last admin', async () => {
    const lastAdmin = makeUser({ id: 5, role: 'admin' });
    const repo = makeAdminRepo({
      countAdmins: jest.fn().mockResolvedValue(1),
      listUsers: jest.fn().mockResolvedValue(makePaginatedAdmins([lastAdmin])),
    });
    const uc = new ChangeUserRoleUseCase(repo);

    await expect(uc.execute({ userId: 5, newRole: 'visitor', actorId: 99 })).rejects.toThrow(
      AppError,
    );

    await expect(uc.execute({ userId: 5, newRole: 'visitor', actorId: 99 })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('allows demoting a non-last admin', async () => {
    const repo = makeAdminRepo({
      countAdmins: jest.fn().mockResolvedValue(2),
      changeUserRole: jest.fn().mockResolvedValue(makeUser({ id: 5, role: 'visitor' })),
    });
    const uc = new ChangeUserRoleUseCase(repo);

    const result = await uc.execute({ userId: 5, newRole: 'visitor', actorId: 99 });

    expect(result.role).toBe('visitor');
  });

  it('allows demoting when target user is not admin (even if 1 admin exists)', async () => {
    const adminUser = makeUser({ id: 5, role: 'admin' });
    const repo = makeAdminRepo({
      countAdmins: jest.fn().mockResolvedValue(1),
      // The listUsers with role=admin returns the single admin (id=5), not the target (id=10)
      listUsers: jest.fn().mockResolvedValue(makePaginatedAdmins([adminUser])),
      changeUserRole: jest.fn().mockResolvedValue(makeUser({ id: 10, role: 'moderator' })),
    });
    const uc = new ChangeUserRoleUseCase(repo);

    // Target user 10 is NOT the last admin (id=5 is), so this should succeed
    const result = await uc.execute({ userId: 10, newRole: 'moderator', actorId: 99 });

    expect(result.role).toBe('moderator');
  });

  it('logs an audit event on success', async () => {
    const repo = makeAdminRepo({
      changeUserRole: jest.fn().mockResolvedValue(makeUser({ role: 'moderator' })),
      countAdmins: jest.fn().mockResolvedValue(2),
    });
    const uc = new ChangeUserRoleUseCase(repo);

    await uc.execute({
      userId: 1,
      newRole: 'moderator',
      actorId: 99,
      ip: '10.0.0.1',
      requestId: 'req-abc',
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ADMIN_ROLE_CHANGE',
        actorType: 'user',
        actorId: 99,
        targetType: 'user',
        targetId: '1',
        metadata: { newRole: 'moderator' },
        ip: '10.0.0.1',
        requestId: 'req-abc',
      }),
    );
  });

  it('does not log audit when user is not found', async () => {
    const repo = makeAdminRepo({
      changeUserRole: jest.fn().mockResolvedValue(null),
    });
    const uc = new ChangeUserRoleUseCase(repo);

    await expect(uc.execute({ userId: 999, newRole: 'admin', actorId: 99 })).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('throws 404 when user does not exist', async () => {
    const repo = makeAdminRepo({
      changeUserRole: jest.fn().mockResolvedValue(null),
    });
    const uc = new ChangeUserRoleUseCase(repo);

    await expect(uc.execute({ userId: 999, newRole: 'admin', actorId: 99 })).rejects.toThrow(
      'User not found',
    );
  });
});
