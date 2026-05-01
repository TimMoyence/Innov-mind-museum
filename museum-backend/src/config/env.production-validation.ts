import type { AppEnv } from './env.types';

/** Throws if `name`'s `value` is empty/missing. */
const required = (name: string, value: string | undefined): string => {
  if (!value?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

/** Minimum length for JWT signing secrets in production (L2). */
const MIN_JWT_SECRET_LENGTH = 32;

/** Throws if the given JWT secret is shorter than {@link MIN_JWT_SECRET_LENGTH}. */
function assertSecretLength(name: string, value: string): void {
  if (value.length >= MIN_JWT_SECRET_LENGTH) return;
  const required = String(MIN_JWT_SECRET_LENGTH);
  const actual = String(value.length);
  throw new Error(
    `${name} must be >= ${required} chars in production (current length: ${actual}).`,
  );
}

/** Validates JWT secrets are set, distinct, and sufficiently long in production. */
function validateJwtSecrets(env: AppEnv): void {
  // SEC-HARDENING (H12): legacy JWT_SECRET fallback is disabled in prod.
  // Require the discrete secrets explicitly.
  required('JWT_ACCESS_SECRET', process.env.JWT_ACCESS_SECRET);
  required('JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET);

  // SEC-HARDENING (H12): loudly warn operators if the legacy JWT_SECRET is
  // still exported in production — it is silently ignored and should be
  // removed from the environment to avoid confusion during incident response.
  if (process.env.JWT_SECRET?.trim()) {
    console.warn(
      'JWT_SECRET is set in production but is no longer honored. ' +
        'Remove it from the environment; only JWT_ACCESS_SECRET / JWT_REFRESH_SECRET are used.',
    );
  }

  // SEC-HARDENING: Access and refresh token secrets MUST differ.
  // Sharing the same secret defeats token type separation — a stolen access token
  // signature could theoretically be replayed as a refresh token (only the 'type'
  // claim differs). Enforced at startup to fail fast on misconfiguration.
  if (env.auth.accessTokenSecret === env.auth.refreshTokenSecret) {
    throw new Error(
      'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be distinct values. ' +
        'Sharing the same secret defeats token type separation.',
    );
  }

  // SEC-HARDENING (L2): JWT secrets MUST be at least 32 chars (~256 bits of
  // entropy for hex/base64-derived secrets). Short secrets are trivially
  // brute-forced offline once a token is captured.
  assertSecretLength('JWT_ACCESS_SECRET', env.auth.accessTokenSecret);
  assertSecretLength('JWT_REFRESH_SECRET', env.auth.refreshTokenSecret);
}

/** Validates the LLM provider's API key is set. */
function validateLlmProviderKey(env: AppEnv): void {
  switch (env.llm.provider) {
    case 'openai':
      required('OPENAI_API_KEY', env.llm.openAiApiKey);
      return;
    case 'deepseek':
      required('DEEPSEEK_API_KEY', env.llm.deepseekApiKey);
      return;
    case 'google':
      required('GOOGLE_API_KEY', env.llm.googleApiKey);
      return;
  }
}

/** Validates S3 storage credentials when the S3 driver is selected. */
function validateS3Storage(env: AppEnv): void {
  if (env.storage.driver !== 's3') return;
  required('S3_ENDPOINT', env.storage.s3?.endpoint);
  required('S3_REGION', env.storage.s3?.region);
  required('S3_BUCKET', env.storage.s3?.bucket);
  required('S3_ACCESS_KEY_ID', env.storage.s3?.accessKeyId);
  required('S3_SECRET_ACCESS_KEY', env.storage.s3?.secretAccessKey);
}

/** Validates Redis credentials when cache is enabled. */
function validateRedis(env: AppEnv): void {
  if (!env.cache?.enabled) return;
  const password = required('REDIS_PASSWORD', env.cache.password);
  required('REDIS_URL or REDIS_HOST', process.env.REDIS_URL || process.env.REDIS_HOST);

  // P3.1: enforce >=32 char Redis password in production. Rate-limit buckets
  // and the LLM cache live in Redis; a weak password == hijackable session
  // store. Rotation playbook: docs/RUNBOOKS/redis-rotation.md (quarterly).
  assertSecretLength('REDIS_PASSWORD', password);

  // Reject sharing the Redis password with any signing secret. Operators have
  // copy-pasted secrets across services in past incidents; this catches it.
  if (password === process.env.JWT_ACCESS_SECRET) {
    throw new Error(
      'REDIS_PASSWORD must be distinct from JWT_ACCESS_SECRET in production. ' +
        'Sharing secrets across services defeats key rotation.',
    );
  }
  if (password === process.env.JWT_REFRESH_SECRET) {
    throw new Error('REDIS_PASSWORD must be distinct from JWT_REFRESH_SECRET in production.');
  }
  if (password === process.env.MEDIA_SIGNING_SECRET) {
    throw new Error('REDIS_PASSWORD must be distinct from MEDIA_SIGNING_SECRET in production.');
  }
}

/**
 * Validates required environment variables for production deployments.
 * Called from env.ts only when `NODE_ENV === 'production'`.
 *
 * Throws on missing/invalid configuration to fail fast on startup.
 */
export function validateProductionEnv(env: AppEnv): void {
  // Phase 5 sentinel: 'test' email service is forbidden in production.
  // It silently swallows all outbound emails into an in-memory store, so any
  // misconfiguration would cause real verification emails to be lost.
  if (env.auth.emailServiceKind === 'test') {
    throw new Error(
      "AUTH_EMAIL_SERVICE_KIND='test' is forbidden in production. " +
        "Set BREVO_API_KEY and use 'brevo', or set AUTH_EMAIL_SERVICE_KIND='noop' to disable email delivery.",
    );
  }

  if (!env.brevoApiKey) {
    console.warn('BREVO_API_KEY not set \u2014 password reset emails will not be sent');
  }

  validateJwtSecrets(env);

  required('PGDATABASE', process.env.PGDATABASE);
  required('CORS_ORIGINS', process.env.CORS_ORIGINS);

  // SEC-HARDENING (L3): MEDIA_SIGNING_SECRET must be set explicitly in
  // production — no fallback to JWT_ACCESS_SECRET / JWT_SECRET. It must
  // also be distinct from the JWT secrets so a rotation/leak of one does
  // not compromise the other.
  const mediaSigningSecret = required('MEDIA_SIGNING_SECRET', process.env.MEDIA_SIGNING_SECRET);
  if (mediaSigningSecret === process.env.JWT_ACCESS_SECRET) {
    throw new Error(
      'MEDIA_SIGNING_SECRET must be distinct from JWT_ACCESS_SECRET in production. ' +
        'Sharing secrets across signing domains defeats key rotation.',
    );
  }
  if (mediaSigningSecret === process.env.JWT_REFRESH_SECRET) {
    throw new Error('MEDIA_SIGNING_SECRET must be distinct from JWT_REFRESH_SECRET in production.');
  }

  // R16 MFA (W2.T4): MFA_ENCRYPTION_KEY must be present, distinct from every
  // other signing secret, and >= 32 chars (256 bits of entropy). Sharing a
  // signing key across MFA / JWT / media defeats key rotation: leaking one
  // would compromise all three trust domains.
  validateMfaSecrets(env);

  // F7 (2026-04-30): CSRF_SECRET MUST be present, distinct from every other
  // signing secret, and >= 32 chars. Same threat model as MFA / media: if it
  // collides with JWT_ACCESS_SECRET, an attacker who learns the access token
  // (or its signing key) can also forge the CSRF token.
  validateCsrfSecret(env);

  validateLlmProviderKey(env);
  validateS3Storage(env);
  validateRedis(env);
}

/** Enforces CSRF_SECRET presence, length, and distinctness in production (F7). */
function validateCsrfSecret(env: AppEnv): void {
  const csrf = required('CSRF_SECRET', process.env.CSRF_SECRET);
  assertSecretLength('CSRF_SECRET', csrf);

  if (csrf === process.env.JWT_ACCESS_SECRET) {
    throw new Error(
      'CSRF_SECRET must be distinct from JWT_ACCESS_SECRET in production. ' +
        'Sharing secrets across signing domains defeats key rotation.',
    );
  }
  if (csrf === process.env.JWT_REFRESH_SECRET) {
    throw new Error('CSRF_SECRET must be distinct from JWT_REFRESH_SECRET in production.');
  }
  if (csrf === process.env.MEDIA_SIGNING_SECRET) {
    throw new Error('CSRF_SECRET must be distinct from MEDIA_SIGNING_SECRET in production.');
  }
  if (csrf === process.env.MFA_ENCRYPTION_KEY) {
    throw new Error('CSRF_SECRET must be distinct from MFA_ENCRYPTION_KEY in production.');
  }
  if (csrf === process.env.MFA_SESSION_TOKEN_SECRET) {
    throw new Error('CSRF_SECRET must be distinct from MFA_SESSION_TOKEN_SECRET in production.');
  }

  // Cross-check: parsed env agrees with raw env var (drift detection).
  if (env.auth.csrfSecret !== csrf) {
    throw new Error('env.auth.csrfSecret is out of sync with CSRF_SECRET — env.ts wiring drift.');
  }
}

/** Enforces MFA secret presence + distinctness from JWT / media signing secrets in production. */
function validateMfaSecrets(env: AppEnv): void {
  const mfaKey = required('MFA_ENCRYPTION_KEY', process.env.MFA_ENCRYPTION_KEY);
  const mfaSession = required('MFA_SESSION_TOKEN_SECRET', process.env.MFA_SESSION_TOKEN_SECRET);

  assertSecretLength('MFA_ENCRYPTION_KEY', mfaKey);
  assertSecretLength('MFA_SESSION_TOKEN_SECRET', mfaSession);

  if (mfaKey === process.env.JWT_ACCESS_SECRET) {
    throw new Error(
      'MFA_ENCRYPTION_KEY must be distinct from JWT_ACCESS_SECRET in production. ' +
        'Sharing secrets across signing domains defeats key rotation.',
    );
  }
  if (mfaKey === process.env.JWT_REFRESH_SECRET) {
    throw new Error('MFA_ENCRYPTION_KEY must be distinct from JWT_REFRESH_SECRET in production.');
  }
  if (mfaKey === process.env.MEDIA_SIGNING_SECRET) {
    throw new Error('MFA_ENCRYPTION_KEY must be distinct from MEDIA_SIGNING_SECRET in production.');
  }

  if (mfaSession === process.env.JWT_ACCESS_SECRET) {
    throw new Error(
      'MFA_SESSION_TOKEN_SECRET must be distinct from JWT_ACCESS_SECRET in production.',
    );
  }
  if (mfaSession === process.env.JWT_REFRESH_SECRET) {
    throw new Error(
      'MFA_SESSION_TOKEN_SECRET must be distinct from JWT_REFRESH_SECRET in production.',
    );
  }
  if (mfaSession === mfaKey) {
    throw new Error(
      'MFA_SESSION_TOKEN_SECRET must be distinct from MFA_ENCRYPTION_KEY — ' +
        'one signs short-lived JWTs, the other encrypts data at rest. Reusing ' +
        'either as the other defeats both threat models.',
    );
  }

  // Cross-check: the parsed env value MUST agree with the raw env var so a
  // future refactor that drops the env.ts wiring fails fast here instead of
  // silently bypassing the secret-distinctness contract.
  if (env.auth.mfaEncryptionKey !== mfaKey) {
    throw new Error(
      'env.auth.mfaEncryptionKey is out of sync with MFA_ENCRYPTION_KEY — env.ts wiring drift.',
    );
  }
}
