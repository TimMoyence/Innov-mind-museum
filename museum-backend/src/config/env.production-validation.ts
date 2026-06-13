import { toBoolean } from './env-helpers';

import type { AppEnv } from './env.types';

const required = (name: string, value: string | undefined): string => {
  if (!value?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

/** Min length for JWT signing secrets in prod (L2). */
const MIN_JWT_SECRET_LENGTH = 32;

/** Shared rationale appended to cross-domain secret-reuse distinctness errors. */
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

/** Truthy values accepted for the conscious DeepSeek EU-transfer opt-in. */
function isTransferApproved(raw: string | undefined): boolean {
  return /^(1|true|yes)$/i.test((raw ?? '').trim());
}

function validateLlmProviderKey(env: AppEnv): void {
  switch (env.llm.provider) {
    case 'openai':
      required('OPENAI_API_KEY', env.llm.openAiApiKey);
      return;
    case 'deepseek':
      // COMP-04 — RGPD Art.44-49 / Schrems II. DeepSeek (api.deepseek.com, China)
      // has no EU adequacy decision; sending chat text / images / coarse geo there
      // is an unguarded cross-border transfer. Block in production unless the
      // controller has consciously accepted the risk via a documented flag. The
      // default provider (openai) and google are unaffected — this guard never
      // throws for them, so it cannot break the normal boot path.
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

  // COMP-02 — RGPD Art.32. Object keys are enumerable (chat-images/YYYY/MM/
  // user-<id>/...); a world-readable bucket leaks every user's photos + voice
  // audio. No aws-sdk/Terraform here to assert the bucket Public Access Block
  // automatically, so require the operator to consciously attest they verified
  // it is private before any prod deploy (fail-closed, no boot-time network).
  // Enforcing the block via IaC / GetPublicAccessBlock probe needs cloud creds.
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
  // D3 (W2-07) — the L2 network-fault injector is a TEST-ONLY middleware that
  // deliberately delays, fails, and trickles responses. It MUST be OFF in
  // production UNCONDITIONALLY, with NO escape hatch (stricter than the chaos
  // rate). `shouldMountNetFault` already coerces false in prod, but a misconfig
  // (e.g. a stray `NET_FAULT_INJECTION_ENABLED=true` leaking into the prod
  // environment) is an operator error we fail-fast on at boot rather than
  // silently swallow — mirroring the AUTH_EMAIL_SERVICE_KIND='test' ban class.
  if (toBoolean(process.env.NET_FAULT_INJECTION_ENABLED, false)) {
    throw new Error(
      'NET_FAULT_INJECTION_ENABLED is forbidden in production. The L2 network-fault ' +
        'injector is a TEST-ONLY middleware (deliberately delays/fails/trickles responses) ' +
        'with NO production escape hatch (Decision D3). Remove it from the environment.',
    );
  }

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

  warnIfPlausibleNotConfigured(env);

  validateJwtSecrets(env);

  required('PGDATABASE', process.env.PGDATABASE);
  required('CORS_ORIGINS', process.env.CORS_ORIGINS);

  // SEC-HARDENING (L3): MEDIA_SIGNING_SECRET MUST be explicit in prod — no
  // fallback to JWT_*. Must also be distinct so rotation/leak of one does
  // not compromise the other.
  const mediaSigningSecret = required('MEDIA_SIGNING_SECRET', process.env.MEDIA_SIGNING_SECRET);
  // SEC-HARDENING (L2): >= 32 chars, same floor as every other signing secret.
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

  // W1-C2 (run 2026-05-26-kr-domains): fail-CLOSED at boot when the per-user LLM
  // cost guard is configured but its Redis counter cannot exist. Placed AFTER
  // validateRedis so a misconfigured-but-present Redis throws its specific error
  // first (no masking).
  validateCostGuardRedis(env);
}

/**
 * W1-C2 — fail-CLOSED at boot if the per-user daily LLM cost cap is configured
 * (`OPENAI_USER_DAILY_USD_CAP > 0`, the env.ts default is 0.5) but the Redis cache
 * is disabled (`REDIS_URL` unset → `env.cache` undefined). The cap is enforced via
 * the Redis-backed `llmCostCounter`, wired only inside `if (env.cache?.enabled)`;
 * without Redis the counter stays null and `llmCostGuard` fails OPEN, silently
 * serving paid LLM calls with NO per-user cap. Serving uncapped paid calls in prod
 * is unacceptable (mission "the bill stops running away"), so we block the boot.
 *
 * `userDailyCapUsd === 0` is an explicit operator opt-out and is tolerated. Only
 * invoked from `validateProductionEnv` (production-only).
 *
 * @param env
 */
function validateCostGuardRedis(env: AppEnv): void {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Justification: env trust boundary. AppEnv types `llm.costGuard.userDailyCapUsd` as always-present, but this boot validator is also fed partial env mocks (undefined `llm`/`costGuard`) → bare access threw TypeError (WAVE1-C2 regression). `?? 0` keeps prod fail-CLOSED (default cap 0.5 still throws) while treating absent cap as opt-out. Approved-by: M4-corrective@2026-05-26
  if ((env.llm?.costGuard?.userDailyCapUsd ?? 0) > 0 && !env.cache?.enabled) {
    throw new Error(
      'LLM cost guard is configured (OPENAI_USER_DAILY_USD_CAP > 0) but Redis cache ' +
        'is disabled (REDIS_URL unset) in production. The per-user daily USD cap cannot ' +
        'be enforced without the Redis counter — set REDIS_URL or set ' +
        'OPENAI_USER_DAILY_USD_CAP=0 to explicitly disable the cap.',
    );
  }
}

/**
 * C3.2 (NFR-ROBUST-1) — NON-blocking warn when Plausible analytics is not fully
 * configured. The KR4 funnel goes silent (the PlausibleAdapter no-ops) when
 * either var is absent ; without this warn an operator has no boot-time signal.
 * Never throws — an analytics outage MUST NOT block prod boot (same doctrine as
 * the BREVO_API_KEY warn). Reads the PARSED env (`env.plausible`), not
 * `process.env` directly, mirroring the BREVO precedent.
 */
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

  // Reusing any signing secret as the export salt collapses two trust domains:
  // a leak of the salt would also leak the signing key, and vice-versa. Reject a
  // salt equal to any other production secret. Boot-time check from in-memory env
  // values (no remote attacker) → plain `===` is fine (mirror validateCsrfSecret).

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
  if (salt === process.env.MFA_ENCRYPTION_KEY) {
    throw new Error(
      'EXPORT_PSEUDONYM_SALT must be distinct from MFA_ENCRYPTION_KEY in production.',
    );
  }
  if (salt === process.env.MFA_SESSION_TOKEN_SECRET) {
    throw new Error(
      'EXPORT_PSEUDONYM_SALT must be distinct from MFA_SESSION_TOKEN_SECRET in production.',
    );
  }

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
        SECRET_REUSE_RATIONALE,
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
        SECRET_REUSE_RATIONALE,
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
