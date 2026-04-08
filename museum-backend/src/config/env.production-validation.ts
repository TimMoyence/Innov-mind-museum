import type { AppEnv } from './env.types';

/** Throws if `name`'s `value` is empty/missing. */
const required = (name: string, value: string | undefined): string => {
  if (!value?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

/** Validates JWT secrets are set and distinct in production. */
function validateJwtSecrets(env: AppEnv): void {
  required(
    'JWT_ACCESS_SECRET or JWT_SECRET',
    process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET,
  );
  required('JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET);

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

/**
 * Validates required environment variables for production deployments.
 * Called from env.ts only when `NODE_ENV === 'production'`.
 *
 * Throws on missing/invalid configuration to fail fast on startup.
 */
export function validateProductionEnv(env: AppEnv): void {
  if (!env.brevoApiKey) {
    console.warn('BREVO_API_KEY not set \u2014 password reset emails will not be sent');
  }

  validateJwtSecrets(env);

  required('PGDATABASE', process.env.PGDATABASE);
  required('CORS_ORIGINS', process.env.CORS_ORIGINS);
  required('MEDIA_SIGNING_SECRET', process.env.MEDIA_SIGNING_SECRET);

  validateLlmProviderKey(env);
  validateS3Storage(env);
}
