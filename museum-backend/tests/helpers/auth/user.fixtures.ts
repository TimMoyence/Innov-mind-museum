import type { User } from '@modules/auth/domain/user/user.entity';

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
    contentPreferences: [],
    defaultLocale: 'en-US',
    defaultMuseumMode: true,
    guideLevel: 'beginner',
    dataMode: 'auto',
    audioDescriptionMode: false,
    suspended: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as User;
