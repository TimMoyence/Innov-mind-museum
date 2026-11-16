import openApiSpec from '../../../openapi/openapi.json';
import { makeAdminUserDTO } from 'tests/helpers/admin/admin.fixtures';
import { assertMatchesOpenApiResponse } from 'tests/helpers/openapi/openapi-response-validator';
import { getMetadataArgsStorage } from 'typeorm';

import { listUsersQuerySchema } from '@modules/admin/adapters/primary/http/schemas/admin.schemas';
import { User } from '@modules/auth/domain/user/user.entity';
import { UserRole } from '@modules/auth/domain/user/user-role';

const SERVER_ROLES = Object.values(UserRole);

const exportPayload = (role: string) => ({
  exportedAt: '2026-11-16T10:00:00.000Z',
  schemaVersion: '1',
  user: {
    id: 42,
    email: 'user@example.com',
    role,
    firstname: 'Ada',
    lastname: 'Lovelace',
    locale: null,
    emailVerified: true,
    onboardingCompleted: false,
    createdAt: '2026-11-16T10:00:00.000Z',
    updatedAt: '2026-11-16T10:00:00.000Z',
  },
  consent: [],
  chatSessions: [],
  savedArtworks: [],
  reviews: [],
  supportTickets: [],
});

describe('ROLE-UNIQUE · the server roles are written once', () => {
  it('ROLE-UNIQUE · the contract lists exactly the server roles, no more, no less', () => {
    expect(openApiSpec.components.schemas.UserRole.enum).toEqual(SERVER_ROLES);
  });

  it('ROLE-UNIQUE · the users table accepts exactly the server roles', () => {
    const column = getMetadataArgsStorage().columns.find(
      (c) => c.target === User && c.propertyName === 'role',
    );
    expect(column?.options.enum).toEqual(SERVER_ROLES);
  });

  it.each(SERVER_ROLES)('ROLE-UNIQUE · a personal data export may carry a %s', (role) => {
    assertMatchesOpenApiResponse({
      path: '/api/users/me/export',
      method: 'get',
      statusCode: 200,
      payload: exportPayload(role),
    });
  });

  it('ROLE-UNIQUE · a personal data export never carries a role the server does not know', () => {
    expect(() =>
      assertMatchesOpenApiResponse({
        path: '/api/users/me/export',
        method: 'get',
        statusCode: 200,
        payload: exportPayload('root'),
      }),
    ).toThrow(/OpenAPI response validation failed/);
  });

  it('ROLE-UNIQUE · an admin user listing may carry every server role', () => {
    assertMatchesOpenApiResponse({
      path: '/api/admin/users',
      method: 'get',
      statusCode: 200,
      payload: {
        data: SERVER_ROLES.map((role, index) => makeAdminUserDTO({ id: index + 1, role })),
        total: SERVER_ROLES.length,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
    });
  });

  it('ROLE-UNIQUE · an admin user listing refuses an unknown role on the role field itself', () => {
    expect(() =>
      assertMatchesOpenApiResponse({
        path: '/api/admin/users',
        method: 'get',
        statusCode: 200,
        payload: {
          data: [{ ...makeAdminUserDTO(), role: 'root' }],
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        },
      }),
    ).toThrow(/\$\.data\[0\]\.role/);
  });

  it.each(SERVER_ROLES)('ROLE-UNIQUE · the admin user list filters by %s', (role) => {
    expect(listUsersQuerySchema.parse({ role }).role).toBe(role);
  });

  it('ROLE-UNIQUE · the admin user list refuses to filter by a role the server does not know', () => {
    expect(listUsersQuerySchema.safeParse({ role: 'root' }).success).toBe(false);
  });

  it('ROLE-UNIQUE · the admin user list still lists every role when no filter is given', () => {
    expect(listUsersQuerySchema.parse({}).role).toBeUndefined();
  });
});
