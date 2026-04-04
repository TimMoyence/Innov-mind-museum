import { GenerateApiKeyUseCase } from '@modules/auth/useCase/generateApiKey.useCase';
import { ApiKey } from '@modules/auth/domain/apiKey.entity';

import type { ApiKeyRepository } from '@modules/auth/domain/apiKey.repository.interface';

const makeApiKey = (overrides: Partial<ApiKey> = {}): ApiKey => {
  const key = new ApiKey();
  key.id = 1;
  key.prefix = 'abcd1234';
  key.hash = 'somehash';
  key.salt = 'somesalt';
  key.name = 'Test Key';
  key.userId = 1;
  key.expiresAt = null;
  key.lastUsedAt = null;
  key.isActive = true;
  key.createdAt = new Date('2024-01-01');
  key.updatedAt = new Date('2024-01-01');
  Object.assign(key, overrides);
  return key;
};

const makeMockApiKeyRepo = (
  overrides: Partial<Record<keyof ApiKeyRepository, jest.Mock>> = {},
): jest.Mocked<ApiKeyRepository> => ({
  findByPrefix: jest.fn().mockResolvedValue(null),
  findByUserId: jest.fn().mockResolvedValue([]),
  save: jest
    .fn()
    .mockImplementation((k: ApiKey) => Promise.resolve({ ...k, id: 1, createdAt: new Date() })),
  remove: jest.fn().mockResolvedValue(true),
  updateLastUsed: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe('GenerateApiKeyUseCase', () => {
  it('generates a key with msk_ prefix', async () => {
    const repo = makeMockApiKeyRepo();
    const useCase = new GenerateApiKeyUseCase(repo);

    const result = await useCase.execute(1, 'My API Key');

    expect(result.plaintext).toMatch(/^msk_/);
    expect(result.plaintext.length).toBeGreaterThan(4); // msk_ + base64url chars
  });

  it('returns API key metadata with prefix in msk_XXXXXXXX... format', async () => {
    const repo = makeMockApiKeyRepo();
    const useCase = new GenerateApiKeyUseCase(repo);

    const result = await useCase.execute(1, 'Production Key');

    expect(result.apiKey.prefix).toMatch(/^msk_[A-Za-z0-9_-]{8}\.\.\.$/);
    expect(result.apiKey.name).toBe('Production Key');
    expect(result.apiKey.id).toBeDefined();
    expect(result.apiKey.createdAt).toBeInstanceOf(Date);
  });

  it('saves the key with HMAC-SHA256 hash (not plaintext)', async () => {
    const repo = makeMockApiKeyRepo();
    const useCase = new GenerateApiKeyUseCase(repo);

    const result = await useCase.execute(1, 'Key');

    expect(repo.save).toHaveBeenCalledTimes(1);
    const savedKey = repo.save.mock.calls[0][0] as ApiKey;
    // hash should be a hex string (64 chars for SHA-256)
    expect(savedKey.hash).toMatch(/^[a-f0-9]{64}$/);
    // hash should NOT be the plaintext key
    expect(savedKey.hash).not.toBe(result.plaintext);
    // salt should be a hex string (64 chars for 32 bytes)
    expect(savedKey.salt).toMatch(/^[a-f0-9]{64}$/);
  });

  it('enforces per-user limit of 5 active keys', async () => {
    const existingKeys = Array.from({ length: 5 }, (_, i) =>
      makeApiKey({ id: i + 1, isActive: true }),
    );
    const repo = makeMockApiKeyRepo({
      findByUserId: jest.fn().mockResolvedValue(existingKeys),
    });
    const useCase = new GenerateApiKeyUseCase(repo);

    await expect(useCase.execute(1, 'Sixth Key')).rejects.toThrow('Maximum of 5');
  });

  it('allows creation when some keys are inactive', async () => {
    const existingKeys = [
      ...Array.from({ length: 4 }, (_, i) => makeApiKey({ id: i + 1, isActive: true })),
      makeApiKey({ id: 6, isActive: false }),
      makeApiKey({ id: 7, isActive: false }),
    ];
    const repo = makeMockApiKeyRepo({
      findByUserId: jest.fn().mockResolvedValue(existingKeys),
    });
    const useCase = new GenerateApiKeyUseCase(repo);

    const result = await useCase.execute(1, 'Fifth Active Key');
    expect(result.plaintext).toMatch(/^msk_/);
  });

  it('rejects empty name', async () => {
    const repo = makeMockApiKeyRepo();
    const useCase = new GenerateApiKeyUseCase(repo);

    await expect(useCase.execute(1, '')).rejects.toThrow('name is required');
  });

  it('rejects whitespace-only name', async () => {
    const repo = makeMockApiKeyRepo();
    const useCase = new GenerateApiKeyUseCase(repo);

    await expect(useCase.execute(1, '   ')).rejects.toThrow('name is required');
  });

  it('rejects name exceeding 100 characters', async () => {
    const repo = makeMockApiKeyRepo();
    const useCase = new GenerateApiKeyUseCase(repo);

    const longName = 'a'.repeat(101);
    await expect(useCase.execute(1, longName)).rejects.toThrow('100 characters');
  });

  it('trims the name before saving', async () => {
    const repo = makeMockApiKeyRepo();
    const useCase = new GenerateApiKeyUseCase(repo);

    await useCase.execute(1, '  My Key  ');

    const savedKey = repo.save.mock.calls[0][0] as ApiKey;
    expect(savedKey.name).toBe('My Key');
  });

  it('sets isActive to true on new key', async () => {
    const repo = makeMockApiKeyRepo();
    const useCase = new GenerateApiKeyUseCase(repo);

    await useCase.execute(1, 'Active Key');

    const savedKey = repo.save.mock.calls[0][0] as ApiKey;
    expect(savedKey.isActive).toBe(true);
  });

  it('stores the userId on the key', async () => {
    const repo = makeMockApiKeyRepo();
    const useCase = new GenerateApiKeyUseCase(repo);

    await useCase.execute(42, 'User Key');

    const savedKey = repo.save.mock.calls[0][0] as ApiKey;
    expect(savedKey.userId).toBe(42);
  });

  it('sets expiresAt when provided', async () => {
    const repo = makeMockApiKeyRepo();
    const useCase = new GenerateApiKeyUseCase(repo);

    const expiry = new Date('2025-12-31');
    await useCase.execute(1, 'Expiring Key', expiry);

    const savedKey = repo.save.mock.calls[0][0] as ApiKey;
    expect(savedKey.expiresAt).toEqual(expiry);
  });

  it('sets expiresAt to null when not provided', async () => {
    const repo = makeMockApiKeyRepo();
    const useCase = new GenerateApiKeyUseCase(repo);

    await useCase.execute(1, 'Non-expiring Key');

    const savedKey = repo.save.mock.calls[0][0] as ApiKey;
    expect(savedKey.expiresAt).toBeNull();
  });

  it('extracts first 8 chars of random part as prefix', async () => {
    const repo = makeMockApiKeyRepo();
    const useCase = new GenerateApiKeyUseCase(repo);

    const result = await useCase.execute(1, 'Key');

    // plaintext is msk_<base64url>, prefix in saved key is first 8 chars after msk_
    const randomPart = result.plaintext.slice(4); // remove "msk_"
    const savedKey = repo.save.mock.calls[0][0] as ApiKey;
    expect(savedKey.prefix).toBe(randomPart.slice(0, 8));
  });

  it('generates unique keys on successive calls', async () => {
    const repo = makeMockApiKeyRepo();
    const useCase = new GenerateApiKeyUseCase(repo);

    const result1 = await useCase.execute(1, 'Key 1');
    const result2 = await useCase.execute(1, 'Key 2');

    expect(result1.plaintext).not.toBe(result2.plaintext);
  });
});
