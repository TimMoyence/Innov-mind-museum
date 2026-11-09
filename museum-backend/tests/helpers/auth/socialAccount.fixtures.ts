import { SocialAccount } from '@modules/auth/domain/social-account/socialAccount.entity';

export function makeSocialAccount(overrides: Partial<SocialAccount> = {}): SocialAccount {
  return Object.assign(new SocialAccount(), {
    id: 'social-uuid-1',
    userId: 42,
    provider: 'google',
    providerUserId: 'google-sub-123',
    email: 'user@gmail.com',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  });
}
