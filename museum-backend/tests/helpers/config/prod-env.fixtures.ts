export const VALID_JWT_ACCESS_SECRET = 'a'.repeat(48);

export const VALID_JWT_REFRESH_SECRET = 'b'.repeat(48);

export const VALID_MEDIA_SIGNING_SECRET = 'c'.repeat(48);

export const VALID_CSRF_SECRET = 'f'.repeat(48);

export const VALID_EXPORT_PSEUDONYM_SALT = 'g'.repeat(48);

export function validProductionEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    NODE_ENV: 'production',
    JWT_ACCESS_SECRET: VALID_JWT_ACCESS_SECRET,
    JWT_REFRESH_SECRET: VALID_JWT_REFRESH_SECRET,
    MEDIA_SIGNING_SECRET: VALID_MEDIA_SIGNING_SECRET,
    CSRF_SECRET: VALID_CSRF_SECRET,
    EXPORT_PSEUDONYM_SALT: VALID_EXPORT_PSEUDONYM_SALT,
    PGDATABASE: 'museum_prod',
    CORS_ORIGINS: 'https://app.musaium.com',
    OPENAI_API_KEY: 'sk-test',
    ...overrides,
  };
}
