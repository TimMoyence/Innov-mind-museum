import type { DataSource, Repository } from 'typeorm';

import { SocialAccount } from '@modules/auth/domain/socialAccount.entity';
import { SocialAccountRepositoryPg } from '@modules/auth/adapters/secondary/social-account.repository.pg';
import { makeUser } from 'tests/helpers/auth/user.fixtures';

// ─── TypeORM repo + DataSource mock factory ───
function buildMocks() {
  const repo = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn().mockImplementation((data: unknown) => data),
    delete: jest.fn(),
  } as unknown as jest.Mocked<Repository<SocialAccount>>;

  const dataSource = {
    getRepository: jest.fn().mockReturnValue(repo),
  } as unknown as DataSource;

  return { repo, dataSource };
}

/** Build a fake SocialAccount entity. */
function makeSocialAccount(overrides: Partial<SocialAccount> = {}): SocialAccount {
  const user = makeUser();
  return {
    id: 'sa-uuid-1',
    user,
    userId: user.id,
    provider: 'apple',
    providerUserId: 'apple-user-001',
    email: 'social@example.com',
    createdAt: new Date('2026-01-15T00:00:00Z'),
    ...overrides,
  } as SocialAccount;
}

describe('SocialAccountRepositoryPg', () => {
  let sut: SocialAccountRepositoryPg;
  let repo: jest.Mocked<Repository<SocialAccount>>;

  beforeEach(() => {
    jest.clearAllMocks();
    const mocks = buildMocks();
    repo = mocks.repo;
    sut = new SocialAccountRepositoryPg(mocks.dataSource);
  });

  // ─── findByProviderAndProviderUserId ───
  describe('findByProviderAndProviderUserId', () => {
    it('returns SocialAccountRow when found', async () => {
      const entity = makeSocialAccount();
      repo.findOne.mockResolvedValue(entity);

      const result = await sut.findByProviderAndProviderUserId('apple', 'apple-user-001');

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { provider: 'apple', providerUserId: 'apple-user-001' },
      });
      expect(result).not.toBeNull();
      expect(result!.provider).toBe('apple');
      expect(result!.providerUserId).toBe('apple-user-001');
      expect(result!.userId).toBe(1);
      expect(result!.email).toBe('social@example.com');
    });

    it('returns null when not found', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await sut.findByProviderAndProviderUserId('google', 'unknown-id');

      expect(result).toBeNull();
    });

    it('maps entity email to null when undefined', async () => {
      const entity = makeSocialAccount({ email: undefined });
      repo.findOne.mockResolvedValue(entity);

      const result = await sut.findByProviderAndProviderUserId('apple', 'apple-user-001');

      expect(result!.email).toBeNull();
    });
  });

  // ─── findByUserId ───
  describe('findByUserId', () => {
    it('returns array of SocialAccountRow for a user', async () => {
      const apple = makeSocialAccount({ id: 'sa-1', provider: 'apple' });
      const google = makeSocialAccount({ id: 'sa-2', provider: 'google', providerUserId: 'g-001' });
      repo.find.mockResolvedValue([apple, google]);

      const result = await sut.findByUserId(1);

      expect(repo.find).toHaveBeenCalledWith({ where: { userId: 1 } });
      expect(result).toHaveLength(2);
      expect(result[0].provider).toBe('apple');
      expect(result[1].provider).toBe('google');
    });

    it('returns empty array when user has no social accounts', async () => {
      repo.find.mockResolvedValue([]);

      const result = await sut.findByUserId(999);

      expect(result).toEqual([]);
    });
  });

  // ─── create ───
  describe('create', () => {
    it('creates and saves a social account, returns SocialAccountRow', async () => {
      const saved = makeSocialAccount({ userId: 5 });
      repo.save.mockResolvedValue(saved);

      const result = await sut.create({
        userId: 5,
        provider: 'apple',
        providerUserId: 'apple-user-001',
        email: 'social@example.com',
      });

      expect(repo.create).toHaveBeenCalledWith({
        userId: 5,
        provider: 'apple',
        providerUserId: 'apple-user-001',
        email: 'social@example.com',
      });
      expect(repo.save).toHaveBeenCalled();
      expect(result.userId).toBe(5);
      expect(result.provider).toBe('apple');
      expect(result.email).toBe('social@example.com');
    });

    it('sets email to null when not provided', async () => {
      const saved = makeSocialAccount({ email: null });
      repo.save.mockResolvedValue(saved);

      const result = await sut.create({
        userId: 1,
        provider: 'google',
        providerUserId: 'google-user-001',
      });

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ email: null }));
      expect(result.email).toBeNull();
    });

    it('sets email to null when explicitly passed as null', async () => {
      const saved = makeSocialAccount({ email: null });
      repo.save.mockResolvedValue(saved);

      const result = await sut.create({
        userId: 1,
        provider: 'apple',
        providerUserId: 'apple-x',
        email: null,
      });

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ email: null }));
      expect(result.email).toBeNull();
    });

    it('returns row with all expected fields', async () => {
      const saved = makeSocialAccount({
        id: 'sa-new',
        userId: 10,
        provider: 'google',
        providerUserId: 'g-123',
        email: 'g@test.com',
        createdAt: new Date('2026-03-01'),
      });
      repo.save.mockResolvedValue(saved);

      const result = await sut.create({
        userId: 10,
        provider: 'google',
        providerUserId: 'g-123',
        email: 'g@test.com',
      });

      expect(result).toEqual({
        id: 'sa-new',
        userId: 10,
        provider: 'google',
        providerUserId: 'g-123',
        email: 'g@test.com',
        createdAt: new Date('2026-03-01'),
      });
    });
  });

  // ─── deleteByUserId ───
  describe('deleteByUserId', () => {
    it('deletes all social accounts for the given userId', async () => {
      repo.delete.mockResolvedValue({ affected: 2, raw: [] });

      await sut.deleteByUserId(42);

      expect(repo.delete).toHaveBeenCalledWith({ userId: 42 });
    });

    it('does not throw when no records exist', async () => {
      repo.delete.mockResolvedValue({ affected: 0, raw: [] });

      await expect(sut.deleteByUserId(999)).resolves.toBeUndefined();
    });
  });
});
