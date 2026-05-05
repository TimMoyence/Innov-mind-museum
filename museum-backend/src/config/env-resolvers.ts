/**
 * Pre-computed env-derived values used by the AppEnv literal in env.ts.
 *
 * Extracted from env.ts so the literal can stay focused on shape and so the
 * resolver logic — which has its own units (Redis URL parsing, deployment
 * autodetect, app version fallback chain) — can be tested in isolation.
 *
 * Side-effects to be aware of:
 *   - `resolveDeploymentMode()` writes a single JSON info line to stderr when
 *     it autodetects 'multi'. Intentional: operators see how the mode was
 *     inferred without us depending on `@shared/logger` (which would import
 *     env and create a circular init).
 *   - `warnLegacyJwtSecret()` writes a single JSON warn line to stderr when
 *     production still has JWT_SECRET set. Same circular-init reason.
 */
import { toOptionalString } from './env-helpers';

import type {
  DeploymentMode,
  GuardrailsV2Candidate,
  LlmProvider,
  NodeEnv,
  StorageDriver,
} from './env.types';

/**
 * Resolves Redis connection config with a URL fallback.
 *
 * Priority:
 *   1. REDIS_HOST (+ REDIS_PORT / REDIS_PASSWORD) — explicit discrete vars
 *   2. REDIS_URL — parsed via URL() for managed-Redis providers (e.g. prod)
 *   3. localhost:6379 defaults
 *
 * Prevents ECONNREFUSED floods when only REDIS_URL is set in production.
 */
export function parseRedisUrlFallback(): {
  host: string;
  port: number;
  password: string | undefined;
} {
  const host = toOptionalString(process.env.REDIS_HOST);
  if (host) {
    const portStr = process.env.REDIS_PORT;
    const port = portStr ? Number(portStr) : 6379;
    return {
      host,
      port: Number.isFinite(port) ? port : 6379,
      password: toOptionalString(process.env.REDIS_PASSWORD),
    };
  }

  const urlStr = toOptionalString(process.env.REDIS_URL);
  if (urlStr) {
    try {
      const url = new URL(urlStr);
      return {
        host: url.hostname || 'localhost',
        port: url.port ? Number(url.port) : 6379,
        password:
          toOptionalString(process.env.REDIS_PASSWORD) ||
          (url.password ? decodeURIComponent(url.password) : undefined),
      };
    } catch {
      /* malformed URL — fall through to defaults */
    }
  }

  return {
    host: 'localhost',
    port: 6379,
    password: toOptionalString(process.env.REDIS_PASSWORD),
  };
}

/**
 * Resolves the deployment topology consumed by `assertDeploymentInvariants`.
 *
 * Precedence:
 *   1. Explicit `DEPLOYMENT_MODE` env var (`single` | `multi`). Invalid values
 *      are ignored and fall through to auto-detection.
 *   2. Auto-detect from known multi-instance hints:
 *        - PM2 cluster mode: `NODE_APP_INSTANCE` or `pm_id`
 *        - Kubernetes: `KUBERNETES_SERVICE_HOST` or `K8S_POD_NAME`
 *   3. Default to `single`.
 *
 * When auto-detection triggers (no explicit override), a single JSON info line
 * is written to stderr so operators can see how the mode was inferred. We
 * intentionally do NOT use `@shared/logger` here: the logger imports `env`,
 * so using it would create a circular init.
 */
export function resolveDeploymentMode(): DeploymentMode {
  const explicit = toOptionalString(process.env.DEPLOYMENT_MODE)?.toLowerCase();
  if (explicit === 'single' || explicit === 'multi') {
    return explicit;
  }

  const hints: { key: string; value: string | undefined }[] = [
    { key: 'NODE_APP_INSTANCE', value: toOptionalString(process.env.NODE_APP_INSTANCE) },
    { key: 'pm_id', value: toOptionalString(process.env.pm_id) },
    {
      key: 'KUBERNETES_SERVICE_HOST',
      value: toOptionalString(process.env.KUBERNETES_SERVICE_HOST),
    },
    { key: 'K8S_POD_NAME', value: toOptionalString(process.env.K8S_POD_NAME) },
  ];
  const detected = hints.filter((hint) => hint.value !== undefined);
  if (detected.length > 0) {
    process.stderr.write(
      `${JSON.stringify({
        level: 'info',
        message: 'deployment_mode_autodetected',
        mode: 'multi',
        hints: detected.map((hint) => hint.key),
      })}\n`,
    );
    return 'multi';
  }

  return 'single';
}

/** Validates and narrows `NODE_ENV`. Throws on invalid values. */
export function resolveNodeEnv(): NodeEnv {
  const raw = (process.env.NODE_ENV || 'development') as NodeEnv;
  if (!['development', 'test', 'production'].includes(raw)) {
    throw new Error(`Invalid NODE_ENV="${raw}". Must be development, test, or production.`);
  }
  return raw;
}

/** Whitelist-narrows `LLM_PROVIDER` to a known provider; defaults to openai. */
export function resolveLlmProvider(): LlmProvider {
  const raw = (process.env.LLM_PROVIDER || 'openai').toLowerCase();
  return ['openai', 'deepseek', 'google'].includes(raw) ? (raw as LlmProvider) : 'openai';
}

/** Whitelist-narrows `GUARDRAILS_V2_CANDIDATE`; defaults to off. */
export function resolveGuardrailsCandidate(): GuardrailsV2Candidate {
  const raw = (process.env.GUARDRAILS_V2_CANDIDATE || 'off').toLowerCase();
  return (['off', 'llm-guard', 'nemo', 'prompt-armor', 'llm-judge'] as const).includes(
    raw as GuardrailsV2Candidate,
  )
    ? (raw as GuardrailsV2Candidate)
    : 'off';
}

/** Whitelist-narrows `OBJECT_STORAGE_DRIVER`; defaults to local. */
export function resolveStorageDriver(): StorageDriver {
  const raw = (process.env.OBJECT_STORAGE_DRIVER || 'local').toLowerCase();
  return ['local', 's3'].includes(raw) ? (raw as StorageDriver) : 'local';
}

/**
 * SEC-HARDENING (H12): emit a stderr warn line if production still has
 * `JWT_SECRET` set. We no longer fall back to it, so any orchestration still
 * injecting it almost certainly forgot to rotate to JWT_ACCESS_SECRET +
 * JWT_REFRESH_SECRET. Using stderr directly because `@shared/logger` imports
 * env and would create a circular init.
 */
export function warnLegacyJwtSecret(isProduction: boolean): void {
  if (!isProduction) return;
  if (!toOptionalString(process.env.JWT_SECRET)) return;
  process.stderr.write(
    `${JSON.stringify({
      level: 'warn',
      message: 'jwt_secret_legacy_env_var_ignored',
      hint: 'JWT_SECRET is set in production but no longer honored. Rotate to JWT_ACCESS_SECRET + JWT_REFRESH_SECRET and remove JWT_SECRET from the environment.',
    })}\n`,
  );
}

/** Resolves the application version: APP_VERSION → npm_package_version → 'unknown'. */
export function resolveAppVersion(): string {
  const explicit = toOptionalString(process.env.APP_VERSION);
  if (explicit) return explicit;
  const pkg = toOptionalString(process.env.npm_package_version);
  if (pkg) return pkg;
  return 'unknown';
}

/** Resolves the commit SHA from COMMIT_SHA / GITHUB_SHA — undefined if neither set. */
export function resolveCommitSha(): string | undefined {
  const source = process.env.COMMIT_SHA || process.env.GITHUB_SHA;
  const trimmed = source?.trim();
  return trimmed?.length ? trimmed : undefined;
}
