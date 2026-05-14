import { AppError } from '@shared/errors/app.error';
import { DeleteUserUseCase } from '@modules/admin/useCase/users/deleteUser.useCase';
import { GetUserByIdUseCase } from '@modules/admin/useCase/users/getUserById.useCase';
import { SuspendUserUseCase } from '@modules/admin/useCase/users/suspendUser.useCase';
import { UnsuspendUserUseCase } from '@modules/admin/useCase/users/unsuspendUser.useCase';

import { makeAdminRepo } from '../../../helpers/admin/repo.fixtures';

import type { AdminUserDTO } from '@modules/admin/domain/admin/admin.types';
import type { IRefreshTokenRepository } from '@modules/auth/domain/refresh-token/refresh-token.repository.interface';

// Mock the audit service module so we can assert log calls without touching DB.
jest.mock('@shared/audit', () => ({
  auditService: { log: jest.fn() },
  AUDIT_ADMIN_USER_SUSPENDED: 'ADMIN_USER_SUSPENDED',
  AUDIT_ADMIN_USER_UNSUSPENDED: 'ADMIN_USER_UNSUSPENDED',
  AUDIT_ADMIN_USER_DELETED: 'ADMIN_USER_DELETED',
}));

import { auditService } from '@shared/audit';

const makeDto = (overrides: Partial<AdminUserDTO> = {}): AdminUserDTO => ({
  id: 1,
  email: 'target@example.com',
  firstname: 'Tar',
  lastname: 'Get',
  role: 'visitor',
  museumId: null,
  emailVerified: true,
  suspended: false,
  deletedAt: null,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  ...overrides,
});

const makeRefreshTokenRepoMock = (): jest.Mocked<IRefreshTokenRepository> => {
  return {
    insert: jest.fn(),
    findByJti: jest.fn(),
    rotate: jest.fn(),
    revokeByJti: jest.fn(),
    deleteExpiredTokens: jest.fn(),
    revokeAllForUser: jest.fn().mockResolvedValue(undefined),
    revokeFamily: jest.fn(),
  } as unknown as jest.Mocked<IRefreshTokenRepository>;
};

describe('GetUserByIdUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the user DTO when found', async () => {
    const repo = makeAdminRepo({
      getUserById: jest.fn().mockResolvedValue(makeDto()),
    });
    const sut = new GetUserByIdUseCase(repo);

    const result = await sut.execute({ userId: 1 });

    expect(result.email).toBe('target@example.com');
    expect(repo.getUserById).toHaveBeenCalledWith(1);
  });

  it('throws 404 when user does not exist', async () => {
    const repo = makeAdminRepo({
      getUserById: jest.fn().mockResolvedValue(null),
    });
    const sut = new GetUserByIdUseCase(repo);

    await expect(sut.execute({ userId: 999 })).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('SuspendUserUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('suspends the user and logs ADMIN_USER_SUSPENDED', async () => {
    const repo = makeAdminRepo({
      suspendUser: jest.fn().mockResolvedValue(makeDto({ suspended: true })),
    });
    const sut = new SuspendUserUseCase(repo);

    const result = await sut.execute({ userId: 1, actorId: 99, ip: '1.1.1.1', requestId: 'r1' });

    expect(result.suspended).toBe(true);
    expect(repo.suspendUser).toHaveBeenCalledWith(1);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ADMIN_USER_SUSPENDED',
        actorId: 99,
        targetId: '1',
        ip: '1.1.1.1',
      }),
    );
  });

  it('refuses self-suspend with 409 CANNOT_SUSPEND_SELF', async () => {
    const repo = makeAdminRepo();
    const sut = new SuspendUserUseCase(repo);

    await expect(sut.execute({ userId: 7, actorId: 7 })).rejects.toMatchObject({
      statusCode: 409,
      code: 'CANNOT_SUSPEND_SELF',
    });
    expect(repo.suspendUser).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('returns 404 when target user vanished', async () => {
    const repo = makeAdminRepo({
      suspendUser: jest.fn().mockResolvedValue(null),
    });
    const sut = new SuspendUserUseCase(repo);

    await expect(sut.execute({ userId: 1, actorId: 99 })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(auditService.log).not.toHaveBeenCalled();
  });
});

describe('UnsuspendUserUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('unsuspends and logs ADMIN_USER_UNSUSPENDED', async () => {
    const repo = makeAdminRepo({
      unsuspendUser: jest.fn().mockResolvedValue(makeDto({ suspended: false })),
    });
    const sut = new UnsuspendUserUseCase(repo);

    const result = await sut.execute({ userId: 1, actorId: 99 });

    expect(result.suspended).toBe(false);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ADMIN_USER_UNSUSPENDED' }),
    );
  });

  it('returns 404 when user not found', async () => {
    const repo = makeAdminRepo({
      unsuspendUser: jest.fn().mockResolvedValue(null),
    });
    const sut = new UnsuspendUserUseCase(repo);

    await expect(sut.execute({ userId: 1, actorId: 99 })).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('DeleteUserUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('soft-deletes, revokes refresh tokens, logs ADMIN_USER_DELETED', async () => {
    const target = makeDto({ id: 42, role: 'visitor' });
    const deleted = makeDto({ id: 42, role: 'visitor', deletedAt: '2026-05-14T10:00:00.000Z' });
    const repo = makeAdminRepo({
      getUserById: jest.fn().mockResolvedValue(target),
      softDeleteUser: jest.fn().mockResolvedValue(deleted),
      countAdmins: jest.fn().mockResolvedValue(5),
    });
    const refreshRepo = makeRefreshTokenRepoMock();
    const sut = new DeleteUserUseCase(repo, refreshRepo);

    const result = await sut.execute({ userId: 42, actorId: 99 });

    expect(result.deletedAt).toBe('2026-05-14T10:00:00.000Z');
    expect(repo.softDeleteUser).toHaveBeenCalledWith(42);
    expect(refreshRepo.revokeAllForUser).toHaveBeenCalledWith(42);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ADMIN_USER_DELETED', targetId: '42' }),
    );
  });

  it('refuses to delete the only remaining admin (CANNOT_DELETE_LAST_ADMIN)', async () => {
    const target = makeDto({ id: 1, role: 'admin' });
    const repo = makeAdminRepo({
      getUserById: jest.fn().mockResolvedValue(target),
      countAdmins: jest.fn().mockResolvedValue(1),
    });
    const refreshRepo = makeRefreshTokenRepoMock();
    const sut = new DeleteUserUseCase(repo, refreshRepo);

    await expect(sut.execute({ userId: 1, actorId: 99 })).rejects.toMatchObject({
      statusCode: 409,
      code: 'CANNOT_DELETE_LAST_ADMIN',
    });
    expect(repo.softDeleteUser).not.toHaveBeenCalled();
    expect(refreshRepo.revokeAllForUser).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('refuses to delete the only remaining super_admin', async () => {
    const target = makeDto({ id: 1, role: 'super_admin' });
    const repo = makeAdminRepo({
      getUserById: jest.fn().mockResolvedValue(target),
      countAdmins: jest.fn().mockResolvedValue(1),
    });
    const sut = new DeleteUserUseCase(repo, makeRefreshTokenRepoMock());

    await expect(sut.execute({ userId: 1, actorId: 99 })).rejects.toMatchObject({
      statusCode: 409,
      code: 'CANNOT_DELETE_LAST_ADMIN',
    });
  });

  it('permits deletion of a non-privileged user even when admins == 0', async () => {
    const target = makeDto({ id: 5, role: 'visitor' });
    const deleted = makeDto({ id: 5, role: 'visitor', deletedAt: '2026-05-14T10:00:00.000Z' });
    const repo = makeAdminRepo({
      getUserById: jest.fn().mockResolvedValue(target),
      softDeleteUser: jest.fn().mockResolvedValue(deleted),
      countAdmins: jest.fn().mockResolvedValue(0), // pathological but explicit
    });
    const sut = new DeleteUserUseCase(repo, makeRefreshTokenRepoMock());

    const result = await sut.execute({ userId: 5, actorId: 99 });

    expect(result.deletedAt).not.toBeNull();
    // countAdmins is only consulted for privileged targets, but the mock
    // accepts the call either way — the assertion is that no AppError fires.
    expect(repo.softDeleteUser).toHaveBeenCalledWith(5);
  });

  it('returns 404 when target user does not exist', async () => {
    const repo = makeAdminRepo({
      getUserById: jest.fn().mockResolvedValue(null),
    });
    const sut = new DeleteUserUseCase(repo, makeRefreshTokenRepoMock());

    await expect(sut.execute({ userId: 999, actorId: 99 })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('handles race condition where row vanishes between fetch and softDelete', async () => {
    const target = makeDto({ id: 1, role: 'visitor' });
    const repo = makeAdminRepo({
      getUserById: jest.fn().mockResolvedValue(target),
      softDeleteUser: jest.fn().mockResolvedValue(null),
      countAdmins: jest.fn().mockResolvedValue(5),
    });
    const refreshRepo = makeRefreshTokenRepoMock();
    const sut = new DeleteUserUseCase(repo, refreshRepo);

    await expect(sut.execute({ userId: 1, actorId: 99 })).rejects.toBeInstanceOf(AppError);
    expect(refreshRepo.revokeAllForUser).not.toHaveBeenCalled();
  });
});
