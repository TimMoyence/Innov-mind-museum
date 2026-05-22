import { ApiKey } from '@modules/auth/domain/api-key/apiKey.entity';

/**
 * GDPR DSAR (B3) — factory for `ApiKey` rows. The entity carries `hash` + `salt`
 * (security credentials) which MUST be excluded from the export DTO (R14, D4).
 * The factory seeds them so the completeness test can assert their ABSENCE in
 * the serialized payload.
 * @param overrides - Partial entity override merged on top of the defaults.
 */
export function makeApiKey(overrides: Partial<ApiKey> = {}): ApiKey {
  return Object.assign(new ApiKey(), {
    id: 1,
    prefix: 'mk_live1',
    hash: 'SECRET_HASH_DO_NOT_EXPORT',
    salt: 'SECRET_SALT_DO_NOT_EXPORT',
    name: 'My integration key',
    userId: 42,
    museumId: null,
    expiresAt: new Date('2027-01-01T00:00:00.000Z'),
    lastUsedAt: new Date('2026-05-01T00:00:00.000Z'),
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  });
}
