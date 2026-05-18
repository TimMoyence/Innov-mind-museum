// Pre-computed env-derived values used by AppEnv in env.ts.
//
// Side effects:
//   - `resolveDeploymentMode()` writes JSON info to stderr on autodetect 'multi'.
//   - `warnLegacyJwtSecret()` writes JSON warn to stderr when prod still has JWT_SECRET.
// Uses stderr directly (NOT @shared/logger): logger imports env → circular init.
import { z } from 'zod';

import { toOptionalString } from './env-helpers';

import type {
  DeploymentMode,
  EmbeddingsProvider,
  LlmProvider,
  NodeEnv,
  RerankerProvider,
  StorageDriver,
} from './env.types';

const nodeEnvSchema = z.enum(['development', 'test', 'production']);
const llmProviderSchema = z.enum(['openai', 'deepseek', 'google']);
const storageDriverSchema = z.enum(['local', 's3']);
const embeddingsProviderSchema = z.enum(['siglip-onnx', 'replicate']);
const rerankerProviderSchema = z.enum(['null', 'bge-reranker-v2-m3']);

/**
 * Resolves Redis config. Priority:
 *   1. REDIS_HOST (+ REDIS_PORT / REDIS_PASSWORD)
 *   2. REDIS_URL parsed via URL() for managed-Redis providers
 *   3. localhost:6379 defaults
 * Prevents ECONNREFUSED floods when only REDIS_URL set in prod.
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
 * Resolves deployment topology for `assertDeploymentInvariants`. Precedence:
 *   1. Explicit `DEPLOYMENT_MODE` (`single` | `multi`); invalid → auto-detect.
 *   2. Auto-detect: PM2 (`NODE_APP_INSTANCE`/`pm_id`) or K8s
 *      (`KUBERNETES_SERVICE_HOST`/`K8S_POD_NAME`).
 *   3. Default `single`.
 * Autodetect emits JSON info line to stderr (NOT logger — circular init).
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

/** Throws on invalid `NODE_ENV`. */
export function resolveNodeEnv(): NodeEnv {
  const raw = process.env.NODE_ENV || 'development';
  const result = nodeEnvSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid NODE_ENV="${raw}". Must be development, test, or production.`);
  }
  return result.data;
}

export function resolveLlmProvider(): LlmProvider {
  const raw = (process.env.LLM_PROVIDER || 'openai').toLowerCase();
  return llmProviderSchema.safeParse(raw).data ?? 'openai';
}

export function resolveStorageDriver(): StorageDriver {
  const raw = (process.env.OBJECT_STORAGE_DRIVER || 'local').toLowerCase();
  return storageDriverSchema.safeParse(raw).data ?? 'local';
}

/**
 * C3 (2026-05) — `EMBEDDINGS_PROVIDER`. Default `'siglip-onnx'` (self-hosted
 * CPU, no per-call cost). Unknown values fall back to default rather than throw.
 */
export function resolveEmbeddingsProvider(): EmbeddingsProvider {
  const raw = (process.env.EMBEDDINGS_PROVIDER || 'siglip-onnx').toLowerCase();
  return embeddingsProviderSchema.safeParse(raw).data ?? 'siglip-onnx';
}

/**
 * C9.13 (2026-05) — `RERANK_PROVIDER`. Default `'null'` (V1 prod default,
 * no-op adapter, zero behavior change). Unknown values fall back to default
 * rather than throw — fail-open ethos: misconfigured reranker MUST NOT brick boot.
 */
export function resolveRerankerProvider(): RerankerProvider {
  const raw = (process.env.RERANK_PROVIDER || 'null').toLowerCase();
  return rerankerProviderSchema.safeParse(raw).data ?? 'null';
}

/**
 * SEC-HARDENING (H12): warn if prod still has `JWT_SECRET` set. No longer
 * honored — orchestration injecting it forgot to rotate to JWT_ACCESS_SECRET +
 * JWT_REFRESH_SECRET. Stderr direct (logger imports env → circular init).
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

/** APP_VERSION → npm_package_version → 'unknown'. */
export function resolveAppVersion(): string {
  const explicit = toOptionalString(process.env.APP_VERSION);
  if (explicit) return explicit;
  const pkg = toOptionalString(process.env.npm_package_version);
  if (pkg) return pkg;
  return 'unknown';
}

/** COMMIT_SHA / GITHUB_SHA — undefined if neither set. */
export function resolveCommitSha(): string | undefined {
  const source = process.env.COMMIT_SHA || process.env.GITHUB_SHA;
  const trimmed = source?.trim();
  return trimmed?.length ? trimmed : undefined;
}
