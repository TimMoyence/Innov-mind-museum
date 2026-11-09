import { sameSecret } from '@shared/security/same-secret';

import { toBoolean } from './env-helpers';

import type { AppEnv } from './env.types';

const required = (name: string, value: string | undefined): string => {
  if (!value?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const MIN_JWT_SECRET_LENGTH = 32;

const SECRET_REUSE_RATIONALE = 'Sharing secrets across signing domains defeats key rotation.';

function assertSecretLength(name: string, value: string): void {
  if (value.length >= MIN_JWT_SECRET_LENGTH) return;
  const required = String(MIN_JWT_SECRET_LENGTH);
  const actual = String(value.length);
  throw new Error(
    `${name} must be >= ${required} chars in production (current length: ${actual}).`,
  );
}

function validateJwtSecrets(env: AppEnv): void {
  required('JWT_ACCESS_SECRET', process.env.JWT_ACCESS_SECRET);
  required('JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET);

  if (process.env.JWT_SECRET?.trim()) {
    console.warn(
      'JWT_SECRET is set in production but is no longer honored. ' +
        'Remove it from the environment; only JWT_ACCESS_SECRET / JWT_REFRESH_SECRET are used.',
    );
  }

  if (env.auth.accessTokenSecret === env.auth.refreshTokenSecret) {
    throw new Error(
      'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be distinct values. ' +
        'Sharing the same secret defeats token type separation.',
    );
  }

  assertSecretLength('JWT_ACCESS_SECRET', env.auth.accessTokenSecret);
  assertSecretLength('JWT_REFRESH_SECRET', env.auth.refreshTokenSecret);
}

function isTransferApproved(raw: string | undefined): boolean {
  return /^(1|true|yes)$/i.test((raw ?? '').trim());
}

function validateLlmProviderKey(env: AppEnv): void {
  switch (env.llm.provider) {
    case 'openai':
      required('OPENAI_API_KEY', env.llm.openAiApiKey);
      return;
    case 'deepseek':
      if (!isTransferApproved(process.env.DEEPSEEK_EU_TRANSFER_APPROVED)) {
        throw new Error(
          'LLM_PROVIDER=deepseek is blocked in production (Schrems II): DeepSeek ' +
            '(api.deepseek.com, China) has no EU adequacy decision, so chat/image/geo ' +
            'data would be transferred cross-border without a safeguard. Set ' +
            'DEEPSEEK_EU_TRANSFER_APPROVED=true to consciously accept the transfer risk ' +
            '(document the decision in the ROPA), or use LLM_PROVIDER=openai/google.',
        );
      }
      required('DEEPSEEK_API_KEY', env.llm.deepseekApiKey);
      return;
    case 'google':
      required('GOOGLE_API_KEY', env.llm.googleApiKey);
      return;
  }
}

function validateS3Storage(env: AppEnv): void {
  if (env.storage.driver !== 's3') return;

  if (!isTransferApproved(process.env.S3_PUBLIC_ACCESS_BLOCK_VERIFIED)) {
    throw new Error(
      'S3 object storage in production requires S3_PUBLIC_ACCESS_BLOCK_VERIFIED=true ' +
        '— attest that the bucket Public Access Block is enabled (bucket is PRIVATE; ' +
        'presigned URLs only). Enumerable user-<id> keys make a public bucket a GDPR ' +
        'Art.32 breach. Verify with the cloud console / `aws s3api get-public-access-block`.',
    );
  }

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

  assertSecretLength('REDIS_PASSWORD', password);

  if (sameSecret(password, process.env.JWT_ACCESS_SECRET)) {
    throw new Error(
      'REDIS_PASSWORD must be distinct from JWT_ACCESS_SECRET in production. ' +
        'Sharing secrets across services defeats key rotation.',
    );
  }
  if (sameSecret(password, process.env.JWT_REFRESH_SECRET)) {
    throw new Error('REDIS_PASSWORD must be distinct from JWT_REFRESH_SECRET in production.');
  }
  if (sameSecret(password, process.env.MEDIA_SIGNING_SECRET)) {
    throw new Error('REDIS_PASSWORD must be distinct from MEDIA_SIGNING_SECRET in production.');
  }
}

export function validateProductionEnv(env: AppEnv): void {
  if (toBoolean(process.env.NET_FAULT_INJECTION_ENABLED, false)) {
    throw new Error(
      'NET_FAULT_INJECTION_ENABLED is forbidden in production. The L2 network-fault ' +
        'injector is a TEST-ONLY middleware (deliberately delays/fails/trickles responses) ' +
        'with NO production escape hatch (Decision D3). Remove it from the environment.',
    );
  }

  if (env.auth.emailServiceKind === 'test') {
    throw new Error(
      "AUTH_EMAIL_SERVICE_KIND='test' is forbidden in production. " +
        "Set BREVO_API_KEY and use 'brevo', or set AUTH_EMAIL_SERVICE_KIND='noop' to disable email delivery.",
    );
  }

  if (!env.auth.passwordBreachCheckEnabled) {
    throw new Error(
      'PASSWORD_BREACH_CHECK_ENABLED=false is forbidden in production. ' +
        'The HIBP Pwned Passwords k-anonymity gate is required at registration.',
    );
  }

  if (!env.brevoApiKey) {
    console.warn('BREVO_API_KEY not set \u2014 password reset emails will not be sent');
  }

  warnIfPlausibleNotConfigured(env);

  validateJwtSecrets(env);

  required('PGDATABASE', process.env.PGDATABASE);
  required('CORS_ORIGINS', process.env.CORS_ORIGINS);

  const mediaSigningSecret = required('MEDIA_SIGNING_SECRET', process.env.MEDIA_SIGNING_SECRET);
  assertSecretLength('MEDIA_SIGNING_SECRET', mediaSigningSecret);
  if (mediaSigningSecret === process.env.JWT_ACCESS_SECRET) {
    throw new Error(
      'MEDIA_SIGNING_SECRET must be distinct from JWT_ACCESS_SECRET in production. ' +
        SECRET_REUSE_RATIONALE,
    );
  }
  if (mediaSigningSecret === process.env.JWT_REFRESH_SECRET) {
    throw new Error('MEDIA_SIGNING_SECRET must be distinct from JWT_REFRESH_SECRET in production.');
  }

  validateCsrfSecret(env);

  validateExportPseudonymSalt(env);

  validateLlmProviderKey(env);
  validateS3Storage(env);
  validateRedis(env);

  validateCostGuardRedis(env);
}

function validateCostGuardRedis(env: AppEnv): void {
  if (env.llm.costGuard.userDailyCapUsd > 0 && !env.cache?.enabled) {
    throw new Error(
      'LLM cost guard is configured (OPENAI_USER_DAILY_USD_CAP > 0) but Redis cache ' +
        'is disabled (REDIS_URL unset) in production. The per-user daily USD cap cannot ' +
        'be enforced without the Redis counter — set REDIS_URL or set ' +
        'OPENAI_USER_DAILY_USD_CAP=0 to explicitly disable the cap.',
    );
  }
}

function warnIfPlausibleNotConfigured(env: AppEnv): void {
  const domain = env.plausible?.domain;
  const endpointUrl = env.plausible?.endpointUrl;
  if (domain && endpointUrl) return;

  const missing = [
    domain ? null : 'PLAUSIBLE_DOMAIN',
    endpointUrl ? null : 'PLAUSIBLE_ENDPOINT_URL',
  ]
    .filter(Boolean)
    .join(', ');
  console.warn(
    `Plausible analytics not fully configured (${missing}) — the KR4 funnel ` +
      'will be silent (PlausibleAdapter no-ops). Set these to enable funnel tracking.',
  );
}

function validateExportPseudonymSalt(env: AppEnv): void {
  const salt = required('EXPORT_PSEUDONYM_SALT', process.env.EXPORT_PSEUDONYM_SALT);
  assertSecretLength('EXPORT_PSEUDONYM_SALT', salt);

  if (salt === process.env.JWT_ACCESS_SECRET) {
    throw new Error(
      'EXPORT_PSEUDONYM_SALT must be distinct from JWT_ACCESS_SECRET in production. ' +
        SECRET_REUSE_RATIONALE,
    );
  }
  if (salt === process.env.JWT_REFRESH_SECRET) {
    throw new Error(
      'EXPORT_PSEUDONYM_SALT must be distinct from JWT_REFRESH_SECRET in production.',
    );
  }
  if (salt === process.env.MEDIA_SIGNING_SECRET) {
    throw new Error(
      'EXPORT_PSEUDONYM_SALT must be distinct from MEDIA_SIGNING_SECRET in production.',
    );
  }
  if (salt === process.env.CSRF_SECRET) {
    throw new Error('EXPORT_PSEUDONYM_SALT must be distinct from CSRF_SECRET in production.');
  }

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
        SECRET_REUSE_RATIONALE,
    );
  }
  if (csrf === process.env.JWT_REFRESH_SECRET) {
    throw new Error('CSRF_SECRET must be distinct from JWT_REFRESH_SECRET in production.');
  }
  if (csrf === process.env.MEDIA_SIGNING_SECRET) {
    throw new Error('CSRF_SECRET must be distinct from MEDIA_SIGNING_SECRET in production.');
  }

  if (env.auth.csrfSecret !== csrf) {
    throw new Error('env.auth.csrfSecret is out of sync with CSRF_SECRET — env.ts wiring drift.');
  }
}
