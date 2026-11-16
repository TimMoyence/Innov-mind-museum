import request from 'supertest';

import { AppError } from '@shared/errors/app.error';

import { makeAdminUserDTO } from '../../helpers/admin/admin.fixtures';
import { adminToken, superAdminToken } from '../../helpers/auth/token.helpers';
import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';

const mockSuspendUser = jest.fn();
const mockUnsuspendUser = jest.fn();
const mockDeleteUser = jest.fn();

jest.mock('@modules/admin/useCase', () => ({
  suspendUserUseCase: { execute: (...args: unknown[]) => mockSuspendUser(...args) },
  unsuspendUserUseCase: { execute: (...args: unknown[]) => mockUnsuspendUser(...args) },
  deleteUserUseCase: { execute: (...args: unknown[]) => mockDeleteUser(...args) },
}));

jest.mock('@modules/support/useCase', () => ({}));
jest.mock('@modules/review/useCase', () => ({}));

const { app } = createRouteTestApp();

type Method = 'post' | 'delete';

const ACTIONS: [string, Method, string, jest.Mock][] = [
  ['suspend', 'post', '/api/admin/users/42/suspend', mockSuspendUser],
  ['unsuspend', 'post', '/api/admin/users/42/unsuspend', mockUnsuspendUser],
  ['delete', 'delete', '/api/admin/users/42', mockDeleteUser],
];

const send = (method: Method, path: string) =>
  method === 'post' ? request(app).post(path) : request(app).delete(path);

describe('ACTIONS-UTILISATEUR · suspend, unsuspend and delete a user account', () => {
  beforeEach(() => {
    resetRateLimits();
    jest.clearAllMocks();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it.each(ACTIONS)(
    'ACTIONS-UTILISATEUR · %s answers the updated user for a super_admin, acting as that super_admin on the path user',
    async (_action, method, path, useCase) => {
      const user = makeAdminUserDTO({ id: 42 });
      useCase.mockResolvedValueOnce(user);

      const res = await send(method, path).set('Authorization', `Bearer ${superAdminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ user });
      expect(useCase).toHaveBeenCalledTimes(1);
      expect(useCase).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 42, actorId: 1, ip: expect.any(String) }),
      );
      expect(
        Object.keys(useCase.mock.calls[0][0] as object).sort((a, b) => a.localeCompare(b)),
      ).toEqual(['actorId', 'ip', 'requestId', 'userId']);
    },
  );

  it.each(ACTIONS)(
    'ACTIONS-UTILISATEUR · %s is refused to an admin who is not super_admin',
    async (_action, method, path, useCase) => {
      const res = await send(method, path).set('Authorization', `Bearer ${adminToken()}`);

      expect(res.status).toBe(403);
      expect(useCase).not.toHaveBeenCalled();
    },
  );

  it.each(ACTIONS)(
    'ACTIONS-UTILISATEUR · %s requires authentication',
    async (_action, method, path, useCase) => {
      const res = await send(method, path);

      expect(res.status).toBe(401);
      expect(useCase).not.toHaveBeenCalled();
    },
  );

  it.each(ACTIONS)(
    'ACTIONS-UTILISATEUR · %s refuses a non-numeric user id',
    async (_action, method, path, useCase) => {
      const res = await send(method, path.replace('42', 'abc')).set(
        'Authorization',
        `Bearer ${superAdminToken()}`,
      );

      expect(res.status).toBe(400);
      expect(useCase).not.toHaveBeenCalled();
    },
  );

  it.each(ACTIONS)(
    'ACTIONS-UTILISATEUR · %s answers the refusal of the use case unchanged',
    async (_action, method, path, useCase) => {
      useCase.mockRejectedValueOnce(
        new AppError({ message: 'Last admin', statusCode: 409, code: 'LAST_ADMIN' }),
      );

      const res = await send(method, path).set('Authorization', `Bearer ${superAdminToken()}`);

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ error: { code: 'LAST_ADMIN', message: 'Last admin' } });
    },
  );
});
