import type { User } from '@modules/auth/domain/user.entity';

export const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 1,
    email: 'user@test.com',
    password: '$2b$12$hashedpassword',
    firstname: 'Test',
    lastname: 'User',
    role: 'visitor',
    museumId: null,
    email_verified: false,
    onboarding_completed: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as User;
