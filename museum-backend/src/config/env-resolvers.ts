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
    } catch {}
  }

  return {
    host: 'localhost',
    port: 6379,
    password: toOptionalString(process.env.REDIS_PASSWORD),
  };
}

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

export function resolveNodeEnv(): NodeEnv {
  const raw = process.env.NODE_ENV || 'development';
  const result = nodeEnvSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid NODE_ENV="${raw}". Must be development, test, or production.`);
  }
  return result.data;
}

const choiceOr = <T extends string>(
  schema: z.ZodType<T>,
  value: string | undefined,
  fallback: T,
): T => schema.safeParse((value || fallback).toLowerCase()).data ?? fallback;

export function resolveLlmProvider(): LlmProvider {
  return choiceOr(llmProviderSchema, process.env.LLM_PROVIDER, 'openai');
}

export function resolveStorageDriver(): StorageDriver {
  return choiceOr(storageDriverSchema, process.env.OBJECT_STORAGE_DRIVER, 'local');
}

export function resolveEmbeddingsProvider(): EmbeddingsProvider {
  return choiceOr(embeddingsProviderSchema, process.env.EMBEDDINGS_PROVIDER, 'siglip-onnx');
}

export function resolveRerankerProvider(): RerankerProvider {
  return choiceOr(rerankerProviderSchema, process.env.RERANK_PROVIDER, 'null');
}

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

export function resolveAppVersion(): string {
  const explicit = toOptionalString(process.env.APP_VERSION);
  if (explicit) return explicit;
  const pkg = toOptionalString(process.env.npm_package_version);
  if (pkg) return pkg;
  return 'unknown';
}

export function resolveCommitSha(): string | undefined {
  const source = process.env.COMMIT_SHA || process.env.GITHUB_SHA;
  const trimmed = source?.trim();
  return trimmed?.length ? trimmed : undefined;
}
