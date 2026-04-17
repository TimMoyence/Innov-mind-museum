import dotenv from 'dotenv';

import { validateProductionEnv } from './env.production-validation';

import type {
  AppEnv,
  GuardrailsV2Candidate,
  LlmProvider,
  NodeEnv,
  StorageDriver,
} from './env.types';

dotenv.config();

const toNumber = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const toList = (value: string | undefined): string[] => {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const toOptionalString = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const required = (name: string, value: string | undefined): string => {
  if (!value?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

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
function parseRedisUrlFallback(): { host: string; port: number; password: string | undefined } {
  const host = toOptionalString(process.env.REDIS_HOST);
  if (host) {
    return {
      host,
      port: toNumber(process.env.REDIS_PORT, 6379),
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

const nodeEnvRaw = (process.env.NODE_ENV || 'development') as NodeEnv;
if (!['development', 'test', 'production'].includes(nodeEnvRaw)) {
  throw new Error(`Invalid NODE_ENV="${nodeEnvRaw}". Must be development, test, or production.`);
}
const nodeEnv: NodeEnv = nodeEnvRaw;

const providerRaw = (process.env.LLM_PROVIDER || 'openai').toLowerCase();
const provider: LlmProvider = ['openai', 'deepseek', 'google'].includes(providerRaw)
  ? (providerRaw as LlmProvider)
  : 'openai';

const guardrailsCandidateRaw = (process.env.GUARDRAILS_V2_CANDIDATE || 'off').toLowerCase();
const guardrailsCandidate: GuardrailsV2Candidate = (
  ['off', 'llm-guard', 'nemo', 'prompt-armor'] as const
).includes(guardrailsCandidateRaw as GuardrailsV2Candidate)
  ? (guardrailsCandidateRaw as GuardrailsV2Candidate)
  : 'off';

const storageDriverRaw = (process.env.OBJECT_STORAGE_DRIVER || 'local').toLowerCase();
const storageDriver: StorageDriver = ['local', 's3'].includes(storageDriverRaw)
  ? (storageDriverRaw as StorageDriver)
  : 'local';

const isDev = nodeEnv === 'development' || nodeEnv === 'test';
const isProduction = nodeEnv === 'production';

const resolvedAppVersion = (() => {
  const explicit = toOptionalString(process.env.APP_VERSION);
  if (explicit) return explicit;
  const pkg = toOptionalString(process.env.npm_package_version);
  if (pkg) return pkg;
  return 'unknown';
})();

const resolvedCommitSha = (() => {
  const source = process.env.COMMIT_SHA || process.env.GITHUB_SHA;
  const trimmed = source?.trim();
  return trimmed?.length ? trimmed : undefined;
})();

/** Resolved application configuration singleton, validated at startup. */
const env: AppEnv = {
  nodeEnv,
  port: toNumber(process.env.PORT, 3000),
  appVersion: resolvedAppVersion,
  commitSha: resolvedCommitSha,
  frontendUrl: toOptionalString(process.env.FRONTEND_URL),
  trustProxy: toBoolean(process.env.TRUST_PROXY, true),
  corsOrigins: toList(process.env.CORS_ORIGINS),
  jsonBodyLimit: process.env.JSON_BODY_LIMIT || '1mb',
  requestTimeoutMs: toNumber(process.env.REQUEST_TIMEOUT_MS, 20000),
  dbSynchronize: toBoolean(process.env.DB_SYNCHRONIZE, false),
  dbSsl: toBoolean(process.env.DB_SSL, true),
  dbSslRejectUnauthorized: toBoolean(process.env.DB_SSL_REJECT_UNAUTHORIZED, isProduction),
  db: {
    host: toOptionalString(process.env.DB_HOST) || 'localhost',
    port: toNumber(process.env.DB_PORT, 5432),
    user: toOptionalString(process.env.DB_USER),
    password: toOptionalString(process.env.DB_PASSWORD),
    database: toOptionalString(process.env.PGDATABASE) || 'museumAI',
    poolMax: toNumber(process.env.DB_POOL_MAX, 50),
  },
  auth: {
    jwtSecret: isDev
      ? toOptionalString(process.env.JWT_ACCESS_SECRET) ||
        process.env.JWT_SECRET ||
        'local-dev-jwt-secret'
      : required(
          'JWT_ACCESS_SECRET or JWT_SECRET',
          toOptionalString(process.env.JWT_ACCESS_SECRET) || process.env.JWT_SECRET,
        ),
    accessTokenSecret: isDev
      ? toOptionalString(process.env.JWT_ACCESS_SECRET) ||
        process.env.JWT_SECRET ||
        'local-dev-jwt-secret'
      : required(
          'JWT_ACCESS_SECRET or JWT_SECRET',
          toOptionalString(process.env.JWT_ACCESS_SECRET) || process.env.JWT_SECRET,
        ),
    refreshTokenSecret: isDev
      ? toOptionalString(process.env.JWT_REFRESH_SECRET) ||
        process.env.JWT_SECRET ||
        'local-dev-refresh-jwt-secret'
      : required(
          'JWT_REFRESH_SECRET',
          toOptionalString(process.env.JWT_REFRESH_SECRET) || process.env.JWT_SECRET,
        ),
    accessTokenTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTokenTtl: process.env.JWT_REFRESH_TTL || '180d',
    appleClientId: process.env.APPLE_CLIENT_ID || 'com.musaium.mobile',
    googleClientIds: toList(process.env.GOOGLE_OAUTH_CLIENT_ID).length
      ? toList(process.env.GOOGLE_OAUTH_CLIENT_ID)
      : [],
  },
  llm: {
    provider,
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    audioTranscriptionModel: process.env.LLM_AUDIO_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe',
    temperature: toNumber(process.env.LLM_TEMPERATURE, 0.3),
    timeoutMs: toNumber(process.env.LLM_TIMEOUT_MS, 15000),
    timeoutSummaryMs: toNumber(process.env.LLM_TIMEOUT_SUMMARY_MS, 10000),
    totalBudgetMs: toNumber(process.env.LLM_TOTAL_BUDGET_MS, 25000),
    retries: toNumber(process.env.LLM_RETRIES, 1),
    retryBaseDelayMs: toNumber(process.env.LLM_RETRY_BASE_DELAY_MS, 250),
    maxConcurrent: toNumber(process.env.LLM_MAX_CONCURRENT, 20),
    maxHistoryMessages: toNumber(process.env.LLM_MAX_HISTORY_MESSAGES, 12),
    maxTextLength: toNumber(process.env.LLM_MAX_TEXT_LENGTH, 2000),
    maxImageBytes: toNumber(process.env.LLM_MAX_IMAGE_BYTES, 3 * 1024 * 1024),
    maxAudioBytes: toNumber(process.env.LLM_MAX_AUDIO_BYTES, 12 * 1024 * 1024),
    maxOutputTokens: toNumber(process.env.LLM_MAX_OUTPUT_TOKENS, 800),
    includeDiagnostics:
      nodeEnv === 'production' ? false : toBoolean(process.env.LLM_INCLUDE_DIAGNOSTICS, true),
    openAiApiKey: process.env.OPENAI_API_KEY,
    deepseekApiKey: process.env.DEEPSEEK_API_KEY,
    googleApiKey: process.env.GOOGLE_API_KEY,
  },
  rateLimit: {
    ipLimit: toNumber(process.env.RATE_LIMIT_IP, 200),
    sessionLimit: toNumber(process.env.RATE_LIMIT_SESSION, 120),
    userLimit: toNumber(process.env.RATE_LIMIT_USER, 200),
    windowMs: toNumber(process.env.RATE_LIMIT_WINDOW_MS, 60000),
  },
  upload: {
    allowedMimeTypes: toList(process.env.UPLOAD_ALLOWED_MIME_TYPES).length
      ? toList(process.env.UPLOAD_ALLOWED_MIME_TYPES)
      : ['image/jpeg', 'image/png', 'image/webp'],
    allowedAudioMimeTypes: toList(process.env.UPLOAD_ALLOWED_AUDIO_MIME_TYPES).length
      ? toList(process.env.UPLOAD_ALLOWED_AUDIO_MIME_TYPES)
      : [
          'audio/mpeg',
          'audio/mp3',
          'audio/mp4',
          'audio/x-m4a',
          'audio/wav',
          'audio/x-wav',
          'audio/webm',
          'audio/ogg',
          'audio/aac',
        ],
  },
  tts: toBoolean(process.env.TTS_ENABLED, false)
    ? {
        enabled: true,
        model: process.env.TTS_MODEL || 'tts-1',
        voice: process.env.TTS_VOICE || 'alloy',
        speed: toNumber(process.env.TTS_SPEED, 1),
        maxTextLength: toNumber(process.env.TTS_MAX_TEXT_LENGTH, 4096),
        cacheTtlSeconds: toNumber(process.env.TTS_CACHE_TTL_SECONDS, 86400),
      }
    : undefined,
  cache: toBoolean(process.env.CACHE_ENABLED, false)
    ? {
        enabled: true,
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        password: parseRedisUrlFallback().password,
        sessionTtlSeconds: toNumber(process.env.CACHE_SESSION_TTL_SECONDS, 3600),
        listTtlSeconds: toNumber(process.env.CACHE_LIST_TTL_SECONDS, 300),
        llmTtlSeconds: toNumber(process.env.CACHE_LLM_TTL_SECONDS, 604_800),
        llmPopularityTtlSeconds: toNumber(process.env.CACHE_LLM_POPULARITY_TTL_SECONDS, 2_592_000),
        lowDataPackMaxEntries: toNumber(process.env.LOW_DATA_PACK_MAX_ENTRIES, 30),
      }
    : undefined,
  sentry: toOptionalString(process.env.SENTRY_DSN)
    ? {
        dsn: (process.env.SENTRY_DSN ?? '').trim(),
        environment: nodeEnv,
        release: resolvedAppVersion === 'unknown' ? '1.0.0' : resolvedAppVersion,
        tracesSampleRate: toNumber(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1),
        profilesSampleRate: toNumber(process.env.SENTRY_PROFILES_SAMPLE_RATE, 0),
      }
    : undefined,
  otel: toBoolean(process.env.OTEL_ENABLED, false)
    ? {
        enabled: true,
        exporterEndpoint: process.env.OTEL_EXPORTER_ENDPOINT || 'http://localhost:4318',
        serviceName: process.env.OTEL_SERVICE_NAME || 'museum-backend',
      }
    : undefined,
  featureFlags: {
    voiceMode: toBoolean(process.env.FEATURE_FLAG_VOICE_MODE, false),
    ocrGuard: toBoolean(process.env.FEATURE_FLAG_OCR_GUARD, false),
    apiKeys: toBoolean(process.env.FEATURE_FLAG_API_KEYS, false),
    streaming: toBoolean(process.env.FEATURE_FLAG_STREAMING, false),
    multiTenancy: toBoolean(process.env.FEATURE_FLAG_MULTI_TENANCY, false),
    userMemory: toBoolean(process.env.FEATURE_FLAG_USER_MEMORY, false),
    knowledgeBase: toBoolean(process.env.FEATURE_FLAG_KNOWLEDGE_BASE, false),
    imageEnrichment: toBoolean(process.env.FEATURE_FLAG_IMAGE_ENRICHMENT, false),
    webSearch: toBoolean(process.env.FEATURE_FLAG_WEB_SEARCH, false),
    knowledgeExtraction: toBoolean(process.env.FEATURE_FLAG_KNOWLEDGE_EXTRACTION, false),
    artTopicClassifier: toBoolean(process.env.FEATURE_ART_TOPIC_CLASSIFIER, false),
  },
  freeTierDailyChatLimit: toNumber(process.env.FREE_TIER_DAILY_CHAT_LIMIT, 100),
  overpassCacheTtlSeconds: toNumber(process.env.OVERPASS_CACHE_TTL_SECONDS, 86400),
  knowledgeBase: {
    timeoutMs: toNumber(process.env.KB_TIMEOUT_MS, 500),
    cacheTtlSeconds: toNumber(process.env.KB_CACHE_TTL_SECONDS, 3600),
    cacheMaxEntries: toNumber(process.env.KB_CACHE_MAX_ENTRIES, 500),
  },
  imageEnrichment: {
    unsplashAccessKey: toOptionalString(process.env.UNSPLASH_ACCESS_KEY),
    cacheTtlMs: toNumber(process.env.IMAGE_ENRICHMENT_CACHE_TTL_MS, 3600000),
    cacheMaxEntries: toNumber(process.env.IMAGE_ENRICHMENT_CACHE_MAX_ENTRIES, 200),
    fetchTimeoutMs: toNumber(process.env.IMAGE_ENRICHMENT_FETCH_TIMEOUT_MS, 3000),
    maxImagesPerResponse: toNumber(process.env.IMAGE_ENRICHMENT_MAX_IMAGES, 5),
  },
  webSearch: {
    tavilyApiKey: toOptionalString(process.env.TAVILY_API_KEY),
    googleCseApiKey: toOptionalString(process.env.GOOGLE_CSE_API_KEY),
    googleCseId: toOptionalString(process.env.GOOGLE_CSE_ID),
    braveSearchApiKey: toOptionalString(process.env.BRAVE_SEARCH_API_KEY),
    searxngInstances: (process.env.SEARXNG_INSTANCES ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    timeoutMs: toNumber(process.env.WEB_SEARCH_TIMEOUT_MS, 3000),
    cacheTtlSeconds: toNumber(process.env.WEB_SEARCH_CACHE_TTL_SECONDS, 3600),
    maxResults: toNumber(process.env.WEB_SEARCH_MAX_RESULTS, 5),
  },
  extraction: {
    queueConcurrency: toNumber(process.env.EXTRACTION_QUEUE_CONCURRENCY, 2),
    queueRateLimit: toNumber(process.env.EXTRACTION_QUEUE_RATE_LIMIT, 60),
    scrapeTimeoutMs: toNumber(process.env.EXTRACTION_SCRAPE_TIMEOUT_MS, 5000),
    contentMaxBytes: toNumber(process.env.EXTRACTION_CONTENT_MAX_BYTES, 51200),
    refetchAfterDays: toNumber(process.env.EXTRACTION_REFETCH_AFTER_DAYS, 7),
    llmModel: process.env.EXTRACTION_LLM_MODEL ?? 'gpt-4o-mini',
    confidenceThreshold: toNumber(process.env.EXTRACTION_CONFIDENCE_THRESHOLD, 0.7),
    reviewThreshold: toNumber(process.env.EXTRACTION_REVIEW_THRESHOLD, 0.4),
  },
  redis: parseRedisUrlFallback(),
  guardrails: {
    candidate: guardrailsCandidate,
    llmGuardUrl: toOptionalString(process.env.GUARDRAILS_V2_LLM_GUARD_URL),
    timeoutMs: toNumber(process.env.GUARDRAILS_V2_TIMEOUT_MS, 300),
    observeOnly: toBoolean(process.env.GUARDRAILS_V2_OBSERVE_ONLY, true),
  },
  brevoApiKey: toOptionalString(process.env.BREVO_API_KEY),
  supportInboxEmail: toOptionalString(process.env.SUPPORT_INBOX_EMAIL) || 'support@musaium.app',
  storage: {
    driver: storageDriver,
    localUploadsDir: toOptionalString(process.env.LOCAL_UPLOADS_DIR) || 'tmp/uploads',
    signedUrlTtlSeconds: toNumber(process.env.S3_SIGNED_URL_TTL_SECONDS, 900),
    signingSecret:
      toOptionalString(process.env.MEDIA_SIGNING_SECRET) ||
      toOptionalString(process.env.JWT_ACCESS_SECRET) ||
      process.env.JWT_SECRET ||
      'local-dev-media-signing-secret',
    s3: {
      endpoint: toOptionalString(process.env.S3_ENDPOINT),
      region: toOptionalString(process.env.S3_REGION),
      bucket: toOptionalString(process.env.S3_BUCKET),
      accessKeyId: toOptionalString(process.env.S3_ACCESS_KEY_ID),
      secretAccessKey: toOptionalString(process.env.S3_SECRET_ACCESS_KEY),
      sessionToken: toOptionalString(process.env.S3_SESSION_TOKEN),
      publicBaseUrl: toOptionalString(process.env.S3_PUBLIC_BASE_URL),
      objectKeyPrefix: toOptionalString(process.env.S3_OBJECT_KEY_PREFIX),
    },
  },
};

if (env.nodeEnv === 'production') {
  validateProductionEnv(env);
}

export { env };
export type { AppEnv, LlmProvider, StorageDriver };
