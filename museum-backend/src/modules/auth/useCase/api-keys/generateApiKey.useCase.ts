import crypto from 'node:crypto';

import { ApiKey } from '@modules/auth/domain/api-key/apiKey.entity';
import { badRequest } from '@shared/errors/app.error';

import type { ApiKeyRepository } from '@modules/auth/domain/api-key/apiKey.repository.interface';

const MAX_KEYS_PER_USER = 5;

/** Result returned to the caller after key generation. The plaintext key is shown only once. */
interface GenerateApiKeyResult {
  apiKey: {
    id: number;
    prefix: string;
    name: string;
    createdAt: Date;
  };
  /** The full plaintext key — returned only once, never stored. */
  plaintext: string;
}

/** Generates a new API key for a user. The key is HMAC-hashed before storage. */
export class GenerateApiKeyUseCase {
  constructor(private readonly apiKeyRepository: ApiKeyRepository) {}

  /**
   * Generate a new API key.
   *
   * @param userId - Owner of the key.
   * @param name - Human-readable label for the key.
   * @param expiresAt - Optional expiration date.
   * @returns The stored key metadata and the plaintext key (shown only once).
   * @throws {AppError} 400 if max key limit reached or name is invalid.
   */
  async execute(userId: number, name: string, expiresAt?: Date): Promise<GenerateApiKeyResult> {
    if (!name || name.trim().length === 0) {
      throw badRequest('API key name is required');
    }
    if (name.length > 100) {
      throw badRequest('API key name must be 100 characters or fewer');
    }

    // Enforce per-user limit
    const existing = await this.apiKeyRepository.findByUserId(userId);
    const activeKeys = existing.filter((k) => k.isActive);
    if (activeKeys.length >= MAX_KEYS_PER_USER) {
      throw badRequest(`Maximum of ${String(MAX_KEYS_PER_USER)} active API keys allowed per user`);
    }

    // Generate random key: msk_<44 base64url chars from 32 bytes>
    const randomBytes = crypto.randomBytes(32);
    const randomPart = randomBytes.toString('base64url');
    const plaintext = `msk_${randomPart}`;

    // Prefix = first 8 chars after "msk_"
    const prefix = randomPart.slice(0, 8);

    // Per-key random salt
    const salt = crypto.randomBytes(32).toString('hex');

    // HMAC-SHA256 hash
    const hash = crypto.createHmac('sha256', salt).update(plaintext).digest('hex');

    const key = new ApiKey();
    key.prefix = prefix;
    key.hash = hash;
    key.salt = salt;
    key.name = name.trim();
    key.userId = userId;
    key.expiresAt = expiresAt ?? null;
    key.isActive = true;

    const saved = await this.apiKeyRepository.save(key);

    return {
      apiKey: {
        id: saved.id,
        prefix: `msk_${prefix}...`,
        name: saved.name,
        createdAt: saved.createdAt,
      },
      plaintext,
    };
  }
}
