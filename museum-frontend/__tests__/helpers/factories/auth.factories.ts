import { faker } from '@faker-js/faker';

import type { components } from '@/shared/api/generated/openapi';

type AuthUser = components['schemas']['AuthUser'];
type AuthSessionResponse = components['schemas']['AuthSessionResponse'];

/** Creates an AuthUser with sensible defaults. */
export const makeAuthUser = (overrides?: Partial<AuthUser>): AuthUser => ({
  id: faker.number.int({ min: 1, max: 10_000 }),
  email: faker.internet.email(),
  firstname: faker.person.firstName(),
  lastname: faker.person.lastName(),
  role: 'visitor',
  onboardingCompleted: true,
  ...overrides,
});

/** Creates an AuthSessionResponse (access + refresh tokens + user) with sensible defaults. */
export const makeAuthTokens = (overrides?: Partial<AuthSessionResponse>): AuthSessionResponse => ({
  accessToken: `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ id: faker.number.int({ min: 1, max: 10_000 }), role: 'visitor' }))}.fake-signature`,
  refreshToken: faker.string.alphanumeric(64),
  expiresIn: 3600,
  refreshExpiresIn: 604_800,
  user: makeAuthUser(),
  ...overrides,
});
