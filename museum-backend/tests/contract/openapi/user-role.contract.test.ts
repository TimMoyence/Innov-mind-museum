import { makeAdminUserDTO } from 'tests/helpers/admin/admin.fixtures';
import {
  assertMatchesOpenApiRequest,
  assertMatchesOpenApiResponse,
} from 'tests/helpers/openapi/openapi-response-validator';

import { UserRole } from '@modules/auth/domain/user/user-role';

const ROLE_PATH = '/api/admin/users/{id}/role';

describe('ROLE-CONTRAT · every role the server knows is in the contract', () => {
  it.each(Object.values(UserRole))('PATCH role accepts %s as the new role', (role) => {
    assertMatchesOpenApiRequest({ path: ROLE_PATH, method: 'patch', body: { role } });
  });

  it.each(Object.values(UserRole))('the user returned by a role change may be %s', (role) => {
    assertMatchesOpenApiResponse({
      path: ROLE_PATH,
      method: 'patch',
      statusCode: 200,
      payload: { user: makeAdminUserDTO({ role }) },
    });
  });

  it.each(Object.values(UserRole))('GET /auth/me may return a %s', (role) => {
    assertMatchesOpenApiResponse({
      path: '/api/auth/me',
      method: 'get',
      statusCode: 200,
      payload: { user: { id: 1, email: 'user@example.com', role, onboardingCompleted: true } },
    });
  });

  it('PATCH role refuses a role the server does not know', () => {
    expect(() =>
      assertMatchesOpenApiRequest({ path: ROLE_PATH, method: 'patch', body: { role: 'root' } }),
    ).toThrow(/OpenAPI request validation failed/);
  });

  it('an admin user listing refuses a role the server does not know', () => {
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
    ).toThrow(/OpenAPI response validation failed/);
  });
});
