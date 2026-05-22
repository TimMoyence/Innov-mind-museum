import type { AppEnv } from './env.types';

const required = (name: string, value: string | undefined): string => {
  if (!value?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

/** Min length for JWT signing secrets in prod (L2). */
const MIN_JWT_SECRET_LENGTH = 32;

function assertSecretLength(name: string, value: string): void {
  if (value.length >= MIN_JWT_SECRET_LENGTH) return;
  const required = String(MIN_JWT_SECRET_LENGTH);
  const actual = String(value.length);
  throw new Error(
    `${name} must be >= ${required} chars in production (current length: ${actual}).`,
  );
}

function validateJwtSecrets(env: AppEnv): void {
  // SEC-HARDENING (H12): legacy JWT_SECRET fallback disabled in prod.
  required('JWT_ACCESS_SECRET', process.env.JWT_ACCESS_SECRET);
  required('JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET);

  // SEC-HARDENING (H12): warn operators if legacy JWT_SECRET still exported
  // (silently ignored — remove to avoid incident-response confusion).
  if (process.env.JWT_SECRET?.trim()) {
    console.warn(
      'JWT_SECRET is set in production but is no longer honored. ' +
        'Remove it from the environment; only JWT_ACCESS_SECRET / JWT_REFRESH_SECRET are used.',
    );
  }

  // SEC-HARDENING: access/refresh secrets MUST differ — sharing defeats type
  // separation (a stolen access-token signature could replay as refresh; only
  // the 'type' claim differs).
  if (env.auth.accessTokenSecret === env.auth.refreshTokenSecret) {
    throw new Error(
      'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be distinct values. ' +
        'Sharing the same secret defeats token type separation.',
    );
  }

  // SEC-HARDENING (L2): >= 32 chars (~256 bits entropy). Short secrets trivially
  // brute-forced offline once a token captured.
  assertSecretLength('JWT_ACCESS_SECRET', env.auth.accessTokenSecret);
  assertSecretLength('JWT_REFRESH_SECRET', env.auth.refreshTokenSecret);
}

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

function validateS3Storage(env: AppEnv): void {
  if (env.storage.driver !== 's3') return;
  required('S3_ENDPOINT', env.storage.s3?.endpoint);
  required('S3_REGION', env.storage.s3?.region);
  required('S3_BUCKET', env.storage.s3?.bucket);
  required('S3_ACCESS_KEY_ID', env.storage.s3?.accessKeyId);
  required('S3_SECRET_ACCESS_KEY', env.storage.s3?.secretAccessKey);
}

function validateRedis(env: AppEnv): void {
  if (!env.cache?.enabled) return;
  const password = required('REDIS_PASSWORD', env.cache.password);
  required('REDIS_URL or REDIS_HOST', process.env.REDIS_URL || process.env.REDIS_HOST);

  // P3.1: >=32 char Redis password. Rate-limit buckets + LLM cache live in
  // Redis; weak password == hijackable session store. Rotation:
  // docs/RUNBOOKS/redis-rotation.md (quarterly).
  assertSecretLength('REDIS_PASSWORD', password);

  // Reject sharing Redis password with any signing secret. Boot-time check
  // from in-memory env values (no remote attacker) → plain `===` is fine.
  /* eslint-disable security/detect-possible-timing-attacks -- boot-time secret-shape check, not a network-exposed comparison */
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
  /* eslint-enable security/detect-possible-timing-attacks */
}

/**
 * Validates required env vars for prod. Called from env.ts only when
 * `NODE_ENV === 'production'`. Throws to fail fast on startup.
 */
export function validateProductionEnv(env: AppEnv): void {
  // Phase 5 sentinel: 'test' email forbidden in prod — silently swallows
  // outbound emails into in-memory store; misconfig would lose real verification mails.
  if (env.auth.emailServiceKind === 'test') {
    throw new Error(
      "AUTH_EMAIL_SERVICE_KIND='test' is forbidden in production. " +
        "Set BREVO_API_KEY and use 'brevo', or set AUTH_EMAIL_SERVICE_KIND='noop' to disable email delivery.",
    );
  }

  // F10 sentinel: HIBP breach gate disable forbidden in prod — would defeat
  // NIST SP 800-63B-4 §3.1.1.2 password screening.
  if (!env.auth.passwordBreachCheckEnabled) {
    throw new Error(
      'PASSWORD_BREACH_CHECK_ENABLED=false is forbidden in production. ' +
        'The HIBP Pwned Passwords k-anonymity gate is required at registration.',
    );
  }

  if (!env.brevoApiKey) {
    console.warn('BREVO_API_KEY not set \u2014 password reset emails will not be sent');
  }

  validateJwtSecrets(env);

  required('PGDATABASE', process.env.PGDATABASE);
  required('CORS_ORIGINS', process.env.CORS_ORIGINS);

  // SEC-HARDENING (L3): MEDIA_SIGNING_SECRET MUST be explicit in prod — no
  // fallback to JWT_*. Must also be distinct so rotation/leak of one does
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

  // R16 MFA (W2.T4): MFA_ENCRYPTION_KEY present, distinct from every other
  // signing secret, >= 32 chars. Sharing across MFA/JWT/media defeats
  // rotation — leaking one compromises three trust domains.
  validateMfaSecrets(env);

  // F7 (2026-04-30): CSRF_SECRET present, distinct, >= 32 chars. If collides
  // with JWT_ACCESS_SECRET, attacker with access-token (or its signing key)
  // can forge the CSRF token.
  validateCsrfSecret(env);

  // I-SEC5 (2026-05-21) — EXPORT_PSEUDONYM_SALT present and >= 32 chars in prod.
  // Historical fallback literal removed (spec §1.1 dictionary attack). Rotation
  // doctrine : `docs/SECURITY.md#export-salt-rotation`.
  validateExportPseudonymSalt(env);

  validateLlmProviderKey(env);
  validateS3Storage(env);
  validateRedis(env);
}

function validateExportPseudonymSalt(env: AppEnv): void {
  const salt = required('EXPORT_PSEUDONYM_SALT', process.env.EXPORT_PSEUDONYM_SALT);
  assertSecretLength('EXPORT_PSEUDONYM_SALT', salt);

  // Drift detection (mirror validateCsrfSecret) — parsed env MUST agree with
  // raw env var. A future refactor dropping the wiring in env.ts would silently
  // bypass the boot gate ; we fail fast instead.
  if (env.exportPseudonymSalt !== salt) {
    throw new Error(
      'env.exportPseudonymSalt is out of sync with EXPORT_PSEUDONYM_SALT — env.ts wiring drift.',
    );
  }
}

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

  // Drift detection: parsed env agrees with raw env var.
  if (env.auth.csrfSecret !== csrf) {
    throw new Error('env.auth.csrfSecret is out of sync with CSRF_SECRET — env.ts wiring drift.');
  }
}

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

  // Drift detection: parsed env MUST agree with raw env var so a future
  // refactor dropping env.ts wiring fails fast instead of silently bypassing
  // the secret-distinctness contract.
  if (env.auth.mfaEncryptionKey !== mfaKey) {
    throw new Error(
      'env.auth.mfaEncryptionKey is out of sync with MFA_ENCRYPTION_KEY — env.ts wiring drift.',
    );
  }
}
