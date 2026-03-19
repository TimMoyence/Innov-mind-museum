import crypto from 'crypto';
import { GenerateApiKeyUseCase } from '@modules/auth/core/useCase/generateApiKey.useCase';
import { RevokeApiKeyUseCase } from '@modules/auth/core/useCase/revokeApiKey.useCase';
import { ListApiKeysUseCase } from '@modules/auth/core/useCase/listApiKeys.useCase';
import { InMemoryApiKeyRepository } from '../../helpers/auth/inMemoryApiKeyRepository';

describe('API Key Authentication', () => {
  let repo: InMemoryApiKeyRepository;

  beforeEach(() => {
    repo = new InMemoryApiKeyRepository();
  });

  describe('GenerateApiKeyUseCase', () => {
    it('returns key starting with msk_', async () => {
      const useCase = new GenerateApiKeyUseCase(repo);
      const result = await useCase.execute(1, 'Test Key');

      expect(result.plaintext).toMatch(/^msk_/);
      expect(result.apiKey.prefix).toMatch(/^msk_[\w-]{8}\.\.\.$/);
      expect(result.apiKey.name).toBe('Test Key');
      expect(result.apiKey.id).toBeDefined();
      expect(result.apiKey.createdAt).toBeInstanceOf(Date);
    });

    it('limits to 5 keys per user', async () => {
      const useCase = new GenerateApiKeyUseCase(repo);

      // Create 5 keys
      for (let i = 0; i < 5; i++) {
        await useCase.execute(1, `Key ${i}`);
      }

      // 6th should fail
      await expect(useCase.execute(1, 'Key 5')).rejects.toMatchObject({
        message: 'Maximum of 5 active API keys allowed per user',
        statusCode: 400,
      });
    });

    it('allows more keys if some are revoked', async () => {
      const useCase = new GenerateApiKeyUseCase(repo);
      const revokeUseCase = new RevokeApiKeyUseCase(repo);

      // Create 5 keys
      const keys = [];
      for (let i = 0; i < 5; i++) {
        keys.push(await useCase.execute(1, `Key ${i}`));
      }

      // Revoke one
      await revokeUseCase.execute(keys[0].apiKey.id, 1);

      // 6th should now succeed
      const result = await useCase.execute(1, 'Key 5');
      expect(result.plaintext).toMatch(/^msk_/);
    });

    it('rejects empty name', async () => {
      const useCase = new GenerateApiKeyUseCase(repo);

      await expect(useCase.execute(1, '')).rejects.toMatchObject({
        message: 'API key name is required',
        statusCode: 400,
      });
    });

    it('rejects name longer than 100 characters', async () => {
      const useCase = new GenerateApiKeyUseCase(repo);
      const longName = 'a'.repeat(101);

      await expect(useCase.execute(1, longName)).rejects.toMatchObject({
        message: 'API key name must be 100 characters or fewer',
        statusCode: 400,
      });
    });
  });

  describe('RevokeApiKeyUseCase', () => {
    it('sets isActive=false', async () => {
      const generateUseCase = new GenerateApiKeyUseCase(repo);
      const revokeUseCase = new RevokeApiKeyUseCase(repo);

      const { apiKey } = await generateUseCase.execute(1, 'Revocable Key');
      const result = await revokeUseCase.execute(apiKey.id, 1);

      expect(result).toEqual({ revoked: true });

      const all = repo.getAll();
      const revoked = all.find((k) => k.id === apiKey.id);
      expect(revoked?.isActive).toBe(false);
    });

    it('throws 404 for non-existent key', async () => {
      const revokeUseCase = new RevokeApiKeyUseCase(repo);

      await expect(revokeUseCase.execute(999, 1)).rejects.toMatchObject({
        message: 'API key not found',
        statusCode: 404,
      });
    });

    it('throws 404 when another user tries to revoke', async () => {
      const generateUseCase = new GenerateApiKeyUseCase(repo);
      const revokeUseCase = new RevokeApiKeyUseCase(repo);

      const { apiKey } = await generateUseCase.execute(1, 'My Key');

      await expect(revokeUseCase.execute(apiKey.id, 999)).rejects.toMatchObject({
        message: 'API key not found',
        statusCode: 404,
      });
    });
  });

  describe('ListApiKeysUseCase', () => {
    it('does not expose hash or salt', async () => {
      const generateUseCase = new GenerateApiKeyUseCase(repo);
      const listUseCase = new ListApiKeysUseCase(repo);

      await generateUseCase.execute(1, 'Key 1');
      await generateUseCase.execute(1, 'Key 2');

      const result = await listUseCase.execute(1);

      expect(result.apiKeys).toHaveLength(2);
      for (const key of result.apiKeys) {
        expect(key).not.toHaveProperty('hash');
        expect(key).not.toHaveProperty('salt');
        expect(key.prefix).toMatch(/^msk_[\w-]{8}\.\.\.$/);
        expect(key.name).toBeDefined();
        expect(key.id).toBeDefined();
        expect(key.isActive).toBeDefined();
      }
    });

    it('returns empty array for user with no keys', async () => {
      const listUseCase = new ListApiKeysUseCase(repo);
      const result = await listUseCase.execute(1);
      expect(result.apiKeys).toEqual([]);
    });
  });

  describe('HMAC verification', () => {
    it('passes with correct key (happy path)', async () => {
      const generateUseCase = new GenerateApiKeyUseCase(repo);
      const { plaintext } = await generateUseCase.execute(1, 'Verify Key');

      // Simulate middleware verification
      const keyBody = plaintext.substring(4); // skip "msk_"
      const prefix = keyBody.substring(0, 8);

      const stored = await repo.findByPrefix(prefix);
      expect(stored).not.toBeNull();

      const expectedHash = crypto.createHmac('sha256', stored!.salt).update(plaintext).digest('hex');
      const expectedBuffer = Buffer.from(expectedHash, 'hex');
      const actualBuffer = Buffer.from(stored!.hash, 'hex');

      expect(expectedBuffer.length).toBe(actualBuffer.length);
      expect(crypto.timingSafeEqual(expectedBuffer, actualBuffer)).toBe(true);
    });

    it('fails with wrong key (timing-safe)', async () => {
      const generateUseCase = new GenerateApiKeyUseCase(repo);
      await generateUseCase.execute(1, 'Verify Key');

      // Get the stored key
      const all = repo.getAll();
      const stored = all[0];

      // Try with a wrong plaintext
      const wrongKey = 'msk_WRONG' + crypto.randomBytes(28).toString('base64url');
      const computedHash = crypto.createHmac('sha256', stored.salt).update(wrongKey).digest('hex');
      const computedBuffer = Buffer.from(computedHash, 'hex');
      const actualBuffer = Buffer.from(stored.hash, 'hex');

      expect(computedBuffer.length).toBe(actualBuffer.length);
      expect(crypto.timingSafeEqual(computedBuffer, actualBuffer)).toBe(false);
    });
  });

  describe('Expired key rejection', () => {
    it('marks expired keys correctly', async () => {
      const generateUseCase = new GenerateApiKeyUseCase(repo);

      // Create a key that expired in the past
      const pastDate = new Date(Date.now() - 60_000); // 1 minute ago
      const { plaintext } = await generateUseCase.execute(1, 'Expiring Key', pastDate);

      // The key is stored and findable by prefix
      const keyBody = plaintext.substring(4);
      const prefix = keyBody.substring(0, 8);
      const stored = await repo.findByPrefix(prefix);

      expect(stored).not.toBeNull();
      expect(stored!.expiresAt).toEqual(pastDate);

      // Verify it's expired
      expect(new Date(stored!.expiresAt!) < new Date()).toBe(true);
    });

    it('does not expire keys with null expiresAt', async () => {
      const generateUseCase = new GenerateApiKeyUseCase(repo);

      const { plaintext } = await generateUseCase.execute(1, 'Permanent Key');

      const keyBody = plaintext.substring(4);
      const prefix = keyBody.substring(0, 8);
      const stored = await repo.findByPrefix(prefix);

      expect(stored).not.toBeNull();
      expect(stored!.expiresAt).toBeNull();
    });
  });
});
