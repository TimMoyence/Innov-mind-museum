/**
 * Shared fixtures for building a valid production-mode env for tests that
 * need to exercise the `validateProductionEnv` path (see
 * `src/config/env.production-validation.ts`).
 *
 * Centralizing these values avoids drift when production validation gains new
 * required fields (JWT length >= 32, distinct MEDIA_SIGNING_SECRET, etc.).
 */

/** 48-char secret, comfortably above the 32-char floor. */
export const VALID_JWT_ACCESS_SECRET = 'a'.repeat(48);

/** Distinct 48-char secret for refresh tokens. */
export const VALID_JWT_REFRESH_SECRET = 'b'.repeat(48);

/**
 * Distinct 48-char secret for media URL signing.
 * Must differ from both JWT secrets (enforced in production validation).
 */
export const VALID_MEDIA_SIGNING_SECRET = 'c'.repeat(48);

/**
 * Minimal set of env vars that satisfy every required production check
 * in `validateProductionEnv`. Tests can override any subset to isolate a
 * specific failure scenario.
 */
export function validProductionEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    NODE_ENV: 'production',
    JWT_ACCESS_SECRET: VALID_JWT_ACCESS_SECRET,
    JWT_REFRESH_SECRET: VALID_JWT_REFRESH_SECRET,
    MEDIA_SIGNING_SECRET: VALID_MEDIA_SIGNING_SECRET,
    PGDATABASE: 'museum_prod',
    CORS_ORIGINS: 'https://app.musaium.com',
    OPENAI_API_KEY: 'sk-test',
    ...overrides,
  };
}
