import { ChangeUserRoleUseCase } from '@modules/admin/useCase/users/changeUserRole.useCase';
import type { AdminUserDTO } from '@modules/admin/domain/admin/admin.types';
import type { PaginatedResult } from '@shared/types/pagination';
import { AppError } from '@shared/errors/app.error';
import { makeAdminUserDTO } from '../../../helpers/admin/admin.fixtures';
import { makeAdminRepo } from '../../../helpers/admin/repo.fixtures';

jest.mock('@shared/audit', () => ({
  auditService: { log: jest.fn(), logActorAction: jest.fn() },
  AUDIT_ADMIN_ROLE_CHANGE: 'ADMIN_ROLE_CHANGE',
}));

import { auditService } from '@shared/audit';

const makeUser = makeAdminUserDTO;

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

  it('allows valid role values', async () => {
    const repo = makeAdminRepo({
      changeUserRole: jest.fn().mockResolvedValue(makeUser({ role: 'moderator' })),
      countActiveAccounts: jest.fn().mockResolvedValue(2),
    });
    const uc = new ChangeUserRoleUseCase(repo);

    const result = await uc.execute({ userId: 1, newRole: 'moderator', actorId: 99 });

    expect(result.role).toBe('moderator');
    expect(repo.changeUserRole).toHaveBeenCalledWith(1, 'moderator');
  });

  it('DERNIER-ADMIN · rétrograder le dernier compte privilégié est refusé en 409 CANNOT_DEMOTE_LAST_ADMIN, qu’il soit admin ou super_admin', async () => {
    for (const role of ['admin', 'super_admin'] as const) {
      const lastAdmin = makeUser({ id: 5, role });
      const repo = makeAdminRepo({
        countActiveAccounts: jest.fn().mockResolvedValue(1),
        getUserById: jest.fn().mockResolvedValue(lastAdmin),
        listUsers: jest
          .fn()
          .mockResolvedValue(makePaginatedAdmins(role === 'admin' ? [lastAdmin] : [])),
        changeUserRole: jest.fn().mockResolvedValue(makeUser({ id: 5, role: 'visitor' })),
      });
      const uc = new ChangeUserRoleUseCase(repo);

      const refusal = await uc
        .execute({ userId: 5, newRole: 'visitor', actorId: 99 })
        .catch((err: unknown) => err);

      expect(refusal).toBeInstanceOf(AppError);
      expect(refusal).toMatchObject({ statusCode: 409, code: 'CANNOT_DEMOTE_LAST_ADMIN' });
      expect(repo.changeUserRole).not.toHaveBeenCalled();
    }
  });

  it('DERNIER-ADMIN · promouvoir le dernier admin en super_admin reste permis : il reste privilégié', async () => {
    const lastAdmin = makeUser({ id: 5, role: 'admin' });
    const superAdminActor = makeUser({ id: 99, role: 'super_admin' });
    const repo = makeAdminRepo({
      countActiveAccounts: jest.fn().mockResolvedValue(1),
      getUserById: jest.fn((id: number) =>
        Promise.resolve(id === superAdminActor.id ? superAdminActor : lastAdmin),
      ),
      listUsers: jest.fn().mockResolvedValue(makePaginatedAdmins([lastAdmin])),
      changeUserRole: jest.fn().mockResolvedValue(makeUser({ id: 5, role: 'super_admin' })),
    });
    const uc = new ChangeUserRoleUseCase(repo);

    const result = await uc.execute({ userId: 5, newRole: 'super_admin', actorId: 99 });

    expect(result.role).toBe('super_admin');
  });

  it('allows demoting a non-last admin', async () => {
    const repo = makeAdminRepo({
      countActiveAccounts: jest.fn().mockResolvedValue(2),
      changeUserRole: jest.fn().mockResolvedValue(makeUser({ id: 5, role: 'visitor' })),
    });
    const uc = new ChangeUserRoleUseCase(repo);

    const result = await uc.execute({ userId: 5, newRole: 'visitor', actorId: 99 });

    expect(result.role).toBe('visitor');
  });

  it('allows demoting when target user is not admin (even if 1 admin exists)', async () => {
    const adminUser = makeUser({ id: 5, role: 'admin' });
    const repo = makeAdminRepo({
      countActiveAccounts: jest.fn().mockResolvedValue(1),
      listUsers: jest.fn().mockResolvedValue(makePaginatedAdmins([adminUser])),
      changeUserRole: jest.fn().mockResolvedValue(makeUser({ id: 10, role: 'moderator' })),
    });
    const uc = new ChangeUserRoleUseCase(repo);

    const result = await uc.execute({ userId: 10, newRole: 'moderator', actorId: 99 });

    expect(result.role).toBe('moderator');
  });

  it('logs an audit event on success', async () => {
    const repo = makeAdminRepo({
      changeUserRole: jest.fn().mockResolvedValue(makeUser({ role: 'moderator' })),
      countActiveAccounts: jest.fn().mockResolvedValue(2),
    });
    const uc = new ChangeUserRoleUseCase(repo);

    await uc.execute({
      userId: 1,
      newRole: 'moderator',
      actorId: 99,
      ip: '10.0.0.1',
      requestId: 'req-abc',
    });

    expect(auditService.logActorAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ADMIN_ROLE_CHANGE',
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

    expect(auditService.logActorAction).not.toHaveBeenCalled();
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
