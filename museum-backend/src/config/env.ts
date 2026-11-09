import path from 'node:path';

import dotenv from 'dotenv';

import {
  required,
  toBoolean,
  toIsoTimestamp,
  toList,
  toNumber,
  toOptionalString,
} from './env-helpers';
import {
  parseRedisUrlFallback,
  resolveAppVersion,
  resolveCommitSha,
  resolveDeploymentMode,
  resolveEmbeddingsProvider,
  resolveLlmProvider,
  resolveNodeEnv,
  resolveRerankerProvider,
  resolveStorageDriver,
  warnLegacyJwtSecret,
} from './env-resolvers';
import { validateProductionEnv } from './env.production-validation';
import { resolveNetFaultEnabled } from './net-fault.config';

import type {
  AppEnv,
  DeploymentMode,
  EmbeddingsProvider,
  LlmProvider,
  RerankerProvider,
  StorageDriver,
} from './env.types';

if (process.env.NODE_ENV !== 'test') {
  dotenv.config();
}

const nodeEnv = resolveNodeEnv();
const provider = resolveLlmProvider();
const storageDriver = resolveStorageDriver();
const deploymentMode = resolveDeploymentMode();
const embeddingsProvider: EmbeddingsProvider = resolveEmbeddingsProvider();
const rerankerProvider: RerankerProvider = resolveRerankerProvider();

const isDev = nodeEnv === 'development' || nodeEnv === 'test';
const isProduction = nodeEnv === 'production';

warnLegacyJwtSecret(isProduction);

const resolvedAppVersion = resolveAppVersion();
const resolvedCommitSha = resolveCommitSha();

const env: AppEnv = {
  nodeEnv,
  deploymentMode,
  port: toNumber(process.env.PORT, 3000),
  appVersion: resolvedAppVersion,
  commitSha: resolvedCommitSha,
  frontendUrl: toOptionalString(process.env.FRONTEND_URL),
  trustProxy: toBoolean(process.env.TRUST_PROXY, true),
  corsOrigins: toList(process.env.CORS_ORIGINS),
  jsonBodyLimit: process.env.JSON_BODY_LIMIT || '1mb',
  requestTimeoutMs: toNumber(process.env.REQUEST_TIMEOUT_MS, 20000),
  idempotencyTtlMs: Math.min(
    3_600_000,
    Math.max(1_000, toNumber(process.env.IDEMPOTENCY_TTL_MS, 600_000)),
  ),
  netFaultInjectionEnabled: resolveNetFaultEnabled(
    process.env.NET_FAULT_INJECTION_ENABLED,
    process.env.NODE_ENV,
  ),
  dbSynchronize: toBoolean(process.env.DB_SYNCHRONIZE, false),
  dbSsl: toBoolean(process.env.DB_SSL, true),
  dbSslRejectUnauthorized: toBoolean(process.env.DB_SSL_REJECT_UNAUTHORIZED, isProduction),
  db: {
    host: toOptionalString(process.env.DB_HOST) || 'localhost',
    port: toNumber(process.env.DB_PORT, 5432),
    user: toOptionalString(process.env.DB_USER),
    password: toOptionalString(process.env.DB_PASSWORD),
    database: required('PGDATABASE', toOptionalString(process.env.PGDATABASE)),
    poolMax: toNumber(process.env.DB_POOL_MAX, 50),
  },
  auth: {
    jwtSecret: isDev
      ? toOptionalString(process.env.JWT_ACCESS_SECRET) ||
        process.env.JWT_SECRET ||
        'local-dev-jwt-secret'
      : required('JWT_ACCESS_SECRET', toOptionalString(process.env.JWT_ACCESS_SECRET)),
    accessTokenSecret: isDev
      ? toOptionalString(process.env.JWT_ACCESS_SECRET) ||
        process.env.JWT_SECRET ||
        'local-dev-jwt-secret'
      : required('JWT_ACCESS_SECRET', toOptionalString(process.env.JWT_ACCESS_SECRET)),
    refreshTokenSecret: isDev
      ? toOptionalString(process.env.JWT_REFRESH_SECRET) ||
        process.env.JWT_SECRET ||
        'local-dev-refresh-jwt-secret'
      : required('JWT_REFRESH_SECRET', toOptionalString(process.env.JWT_REFRESH_SECRET)),
    accessTokenTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTokenTtl: process.env.JWT_REFRESH_TTL || '14d',
    refreshIdleWindowSeconds: toNumber(process.env.JWT_REFRESH_IDLE_WINDOW_SECONDS, 24 * 60 * 60),
    appleClientId: process.env.APPLE_CLIENT_ID || 'com.musaium.mobile',
    googleClientIds: (() => {
      const fromList = toList(process.env.GOOGLE_OAUTH_CLIENT_ID);
      const webId = toOptionalString(process.env.GOOGLE_OAUTH_WEB_CLIENT_ID);
      return webId && !fromList.includes(webId) ? [...fromList, webId] : fromList;
    })(),
    appleJwksUrl: process.env.APPLE_OIDC_JWKS_URL || 'https://appleid.apple.com/auth/keys',
    googleJwksUrl: process.env.GOOGLE_OIDC_JWKS_URL || 'https://www.googleapis.com/oauth2/v3/certs',
    oidcNonceEnforce: toBoolean(process.env.OIDC_NONCE_ENFORCE, false),
    googleWebOauth: {
      clientId: toOptionalString(process.env.GOOGLE_OAUTH_WEB_CLIENT_ID),
      clientSecret: toOptionalString(process.env.GOOGLE_OAUTH_WEB_CLIENT_SECRET),
      redirectUri: toOptionalString(process.env.GOOGLE_OAUTH_REDIRECT_URI),
    },
    csrfSecret: isDev
      ? toOptionalString(process.env.CSRF_SECRET) || 'local-dev-csrf-secret-32chars-minimum'
      : required('CSRF_SECRET', toOptionalString(process.env.CSRF_SECRET)),
    emailServiceKind:
      (process.env.AUTH_EMAIL_SERVICE_KIND as 'test' | 'brevo' | 'noop' | undefined) ?? 'brevo',
    passwordBreachCheckEnabled: toBoolean(process.env.PASSWORD_BREACH_CHECK_ENABLED, true),
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
      nodeEnv === 'development' ? toBoolean(process.env.LLM_INCLUDE_DIAGNOSTICS, true) : false,
    openAiApiKey: process.env.OPENAI_API_KEY,
    deepseekApiKey: process.env.DEEPSEEK_API_KEY,
    googleApiKey: process.env.GOOGLE_API_KEY,
    costGuard: {
      killSwitch: toBoolean(process.env.LLM_KILL_SWITCH, false),
      userDailyCapUsd: toNumber(process.env.OPENAI_USER_DAILY_USD_CAP, 0.5),
    },
  },
  rateLimit: {
    ipLimit: toNumber(process.env.RATE_LIMIT_IP, 200),
    sessionLimit: toNumber(process.env.RATE_LIMIT_SESSION, 120),
    userLimit: toNumber(process.env.RATE_LIMIT_USER, 200),
    windowMs: toNumber(process.env.RATE_LIMIT_WINDOW_MS, 60000),
    failClosed: toBoolean(process.env.RATE_LIMIT_FAIL_CLOSED, isProduction),
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
  tts: {
    model: process.env.TTS_MODEL || 'gpt-4o-mini-tts',
    voice: process.env.TTS_VOICE || 'alloy',
    speed: toNumber(process.env.TTS_SPEED, 1),
    maxTextLength: toNumber(process.env.TTS_MAX_TEXT_LENGTH, 4096),
    cacheTtlSeconds: toNumber(process.env.TTS_CACHE_TTL_SECONDS, 86400),
  },
  cache: toOptionalString(process.env.REDIS_URL)
    ? {
        enabled: true,
        url: (process.env.REDIS_URL ?? '').trim(),
        password: parseRedisUrlFallback().password,
        sessionTtlSeconds: toNumber(process.env.CACHE_SESSION_TTL_SECONDS, 3600),
        listTtlSeconds: toNumber(process.env.CACHE_LIST_TTL_SECONDS, 300),
        lowDataPackMaxEntries: toNumber(process.env.LOW_DATA_PACK_MAX_ENTRIES, 30),
      }
    : undefined,
  sentry: toOptionalString(process.env.SENTRY_DSN)
    ? {
        dsn: (process.env.SENTRY_DSN ?? '').trim(),
        environment: nodeEnv,
        release: resolvedAppVersion === 'unknown' ? '1.0.0' : resolvedAppVersion,
        tracesSampleRate: toNumber(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1),
        profileSessionSampleRate: toNumber(process.env.SENTRY_PROFILE_SESSION_SAMPLE_RATE, 0),
      }
    : undefined,
  otel: toBoolean(process.env.OTEL_ENABLED, false)
    ? {
        enabled: true,
        exporterEndpoint: process.env.OTEL_EXPORTER_ENDPOINT || 'http://localhost:4318',
        serviceName: process.env.OTEL_SERVICE_NAME || 'museum-backend',
      }
    : undefined,
  freeTierDailyChatLimit: toNumber(process.env.FREE_TIER_DAILY_CHAT_LIMIT, 100),
  freeTierMonthlySessionLimit: toNumber(process.env.FREE_TIER_MONTHLY_SESSION_LIMIT, 3),
  overpassCacheTtlSeconds: toNumber(process.env.OVERPASS_CACHE_TTL_SECONDS, 86400),
  overpass: {
    cacheTtlSeconds: toNumber(process.env.OVERPASS_CACHE_TTL_SECONDS, 86_400),
    negativeCacheTtlSeconds: toNumber(process.env.OVERPASS_NEGATIVE_CACHE_TTL_SECONDS, 3_600),
  },
  chatPurgeRetentionDays: toNumber(process.env.CHAT_PURGE_RETENTION_DAYS, 180),
  s3OrphanPurgeRetentionDays: toNumber(process.env.S3_ORPHAN_PURGE_RETENTION_DAYS, 180),
  knowledgeBase: {
    timeoutMs: toNumber(process.env.KB_TIMEOUT_MS, 500),
    cacheTtlSeconds: toNumber(process.env.KB_CACHE_TTL_SECONDS, 3600),
    cacheMaxEntries: toNumber(process.env.KB_CACHE_MAX_ENTRIES, 500),
    breaker: {
      timeoutMs: toNumber(process.env.WIKIDATA_CB_TIMEOUT_MS, 5000),
      errorThresholdPercentage: toNumber(process.env.WIKIDATA_CB_ERROR_THRESHOLD_PCT, 50),
      resetTimeoutMs: toNumber(process.env.WIKIDATA_CB_RESET_TIMEOUT_MS, 30000),
      volumeThreshold: toNumber(process.env.WIKIDATA_CB_VOLUME_THRESHOLD, 5),
      capacity: toNumber(process.env.WIKIDATA_CB_CAPACITY, 5),
    },
    localDumpFallbackAfterMs: toNumber(process.env.LOCAL_DUMP_FALLBACK_AFTER_MS, 60_000),
  },
  wikidata: {
    userAgent:
      toOptionalString(process.env.WIKIDATA_USER_AGENT) ||
      'Musaium/1.0 (https://musaium.com; contact@musaium.com)',
  },
  knowledgeRouter: {
    threshold: toNumber(process.env.WEBSEARCH_FALLBACK_THRESHOLD, 0.7),
    kbTimeoutMs: toNumber(process.env.KNOWLEDGE_ROUTER_KB_TIMEOUT_MS, 200),
    judgeTimeoutMs: toNumber(process.env.KNOWLEDGE_ROUTER_JUDGE_TIMEOUT_MS, 500),
    wsTimeoutMs: toNumber(process.env.KNOWLEDGE_ROUTER_WS_TIMEOUT_MS, 1500),
  },
  nominatim: {
    contactEmail: toOptionalString(process.env.NOMINATIM_CONTACT_EMAIL) || 'contact@musaium.com',
    cacheTtlSeconds: toNumber(process.env.NOMINATIM_CACHE_TTL_SECONDS, 86_400),
    negativeCacheTtlSeconds: toNumber(process.env.NOMINATIM_NEGATIVE_CACHE_TTL_SECONDS, 3_600),
    minRequestIntervalMs: toNumber(process.env.NOMINATIM_MIN_REQUEST_INTERVAL_MS, 1_000),
  },
  imageEnrichment: {
    unsplashAccessKey: toOptionalString(process.env.UNSPLASH_ACCESS_KEY),
    cacheTtlMs: toNumber(process.env.IMAGE_ENRICHMENT_CACHE_TTL_MS, 3600000),
    cacheMaxEntries: toNumber(process.env.IMAGE_ENRICHMENT_CACHE_MAX_ENTRIES, 200),
    fetchTimeoutMs: toNumber(process.env.IMAGE_ENRICHMENT_FETCH_TIMEOUT_MS, 3000),
    maxImagesPerResponse: toNumber(process.env.IMAGE_ENRICHMENT_MAX_IMAGES, 5),
  },
  visualSimilarity: {
    provider: embeddingsProvider,
    siglipOnnxModelPath:
      toOptionalString(process.env.SIGLIP_ONNX_MODEL_PATH) ??
      './models/siglip2-base-patch16-224.onnx',
    replicateApiToken: toOptionalString(process.env.REPLICATE_API_TOKEN),
    embeddingsDim: toNumber(process.env.EMBEDDINGS_DIM, 768),
    topN: toNumber(process.env.VISUAL_TOP_N, 20),
    topKDefault: toNumber(process.env.VISUAL_TOP_K_DEFAULT, 5),
    wVisual: toNumber(process.env.VISUAL_W_VISUAL, 0.7),
    wMeta: toNumber(process.env.VISUAL_W_META, 0.3),
    fallbackVisualThreshold: toNumber(process.env.VISUAL_FALLBACK_VISUAL_THRESHOLD, 0.4),
    embeddingsCacheTtlMs: toNumber(process.env.EMBEDDINGS_CACHE_TTL_MS, 3_600_000),
    encodeTimeoutMs: toNumber(process.env.EMBEDDINGS_ENCODE_TIMEOUT_MS, 3000),
  },
  rerank: {
    provider: rerankerProvider,
    modelPath:
      toOptionalString(process.env.RERANK_MODEL_PATH) ?? './models/bge-reranker-v2-m3.onnx',
    timeoutMs: toNumber(process.env.RERANK_TIMEOUT_MS, 2000),
    topKCandidates: toNumber(process.env.RERANK_TOP_K_CANDIDATES, 50),
    topNFinal: toNumber(process.env.RERANK_TOP_N_FINAL, 5),
  },
  enrichment: {
    hardDeleteAfterDays: toNumber(process.env.ENRICHMENT_HARD_DELETE_AFTER_DAYS, 180),
  },
  webSearch: {
    tavilyApiKey: toOptionalString(process.env.TAVILY_API_KEY),
    braveSearchApiKey: toOptionalString(process.env.BRAVE_SEARCH_API_KEY),
    googleCseApiKey: toOptionalString(process.env.GOOGLE_CSE_API_KEY),
    googleCseId: toOptionalString(process.env.GOOGLE_CSE_ID),
    searxngInstances: (toOptionalString(process.env.SEARXNG_INSTANCES) ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
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
  extractionWorkerEnabled: toBoolean(process.env.EXTRACTION_WORKER_ENABLED, true),
  museumEnrichmentSchedulerEnabled: toBoolean(
    process.env.MUSEUM_ENRICHMENT_SCHEDULER_ENABLED,
    false,
  ),
  redis: {
    ...parseRedisUrlFallback(),
  },
  guardrails: {
    budgetCentsPerDay: toNumber(process.env.LLM_GUARDRAIL_BUDGET_CENTS_PER_DAY, 500),
    judgeTimeoutMs: toNumber(process.env.LLM_GUARDRAIL_JUDGE_TIMEOUT_MS, 1500),
    judgeMinMessageLength: toNumber(process.env.LLM_GUARDRAIL_JUDGE_MIN_LENGTH, 50),
    budgetBackend: process.env.GUARDRAIL_BUDGET_BACKEND === 'memory' ? 'memory' : 'redis',
    frictionSessionThreshold: toNumber(process.env.FRICTION_SESSION_THRESHOLD, 3),
    frictionUserThreshold: toNumber(process.env.FRICTION_USER_THRESHOLD, 10),
    frictionSessionTtlMs: toNumber(process.env.FRICTION_SESSION_TTL_MS, 21_600_000),
    frictionUserTtlMs: toNumber(process.env.FRICTION_USER_TTL_MS, 86_400_000),
    frictionCooldownMs: toNumber(process.env.FRICTION_COOLDOWN_MS, 120_000),
    frictionWeightSecurity: toNumber(process.env.FRICTION_WEIGHT_SECURITY, 2),
    frictionWeightOfftopic: toNumber(process.env.FRICTION_WEIGHT_OFFTOPIC, 1),
    costCircuitBreaker: {
      hourlyThresholdCents: toNumber(process.env.COST_CB_HOURLY_THRESHOLD_CENTS, 5_000),
      dailyBudgetCents: toNumber(process.env.COST_CB_DAILY_BUDGET_CENTS, 50_000),
      openDurationMs: toNumber(process.env.COST_CB_OPEN_DURATION_MS, 300_000),
    },
  },
  retention: {
    cronPattern: process.env.RETENTION_CRON_PATTERN || '15 3 * * *',
    batchLimit: toNumber(process.env.RETENTION_BATCH_LIMIT, 1000),
    supportTicketsDays: toNumber(process.env.RETENTION_SUPPORT_TICKETS_DAYS, 365),
    reviewsRejectedDays: toNumber(process.env.RETENTION_REVIEWS_REJECTED_DAYS, 30),
    reviewsPendingDays: toNumber(process.env.RETENTION_REVIEWS_PENDING_DAYS, 60),
    artKeywordsDays: toNumber(process.env.RETENTION_ART_KEYWORDS_DAYS, 90),
    artKeywordsHitThreshold: toNumber(process.env.RETENTION_ART_KEYWORDS_HIT_THRESHOLD, 1),
  },
  leads: {
    redeliveryCronPattern: process.env.LEADS_REDELIVERY_CRON_PATTERN || '*/5 * * * *',
    maxAttempts: toNumber(process.env.LEADS_MAX_ATTEMPTS, 5),
    redeliveryBatchLimit: toNumber(process.env.LEADS_REDELIVERY_BATCH_LIMIT, 100),
    retentionDays: toNumber(process.env.LEADS_RETENTION_DAYS, 90),
    backoffBaseMs: toNumber(process.env.LEADS_BACKOFF_BASE_MS, 60_000),
    backoffCapMs: toNumber(process.env.LEADS_BACKOFF_CAP_MS, 3_600_000),
  },
  review: {
    npsScaleEpoch: toIsoTimestamp(process.env.NPS_SCALE_EPOCH, '2026-05-27T00:00:00.000Z'),
  },
  brevoApiKey: toOptionalString(process.env.BREVO_API_KEY),
  supportInboxEmail: toOptionalString(process.env.SUPPORT_INBOX_EMAIL) || 'support@musaium.com',
  b2bInboxEmail: toOptionalString(process.env.B2B_INBOX_EMAIL),
  brevoBetaListId: (() => {
    const raw = toOptionalString(process.env.BREVO_BETA_LIST_ID);
    if (!raw) return;
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  })(),
  exportPseudonymSalt: toOptionalString(process.env.EXPORT_PSEUDONYM_SALT),
  storage: {
    driver: storageDriver,
    localUploadsDir: path.resolve(
      process.cwd(),
      toOptionalString(process.env.LOCAL_UPLOADS_DIR) ?? path.join('tmp', 'uploads'),
    ),
    signedUrlTtlSeconds: toNumber(process.env.S3_SIGNED_URL_TTL_SECONDS, 900),
    signingSecret:
      nodeEnv === 'production'
        ? toOptionalString(process.env.MEDIA_SIGNING_SECRET) || ''
        : toOptionalString(process.env.MEDIA_SIGNING_SECRET) ||
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
  plausible: {
    domain: toOptionalString(process.env.PLAUSIBLE_DOMAIN),
    endpointUrl: toOptionalString(process.env.PLAUSIBLE_ENDPOINT_URL),
  },
};

if (env.nodeEnv === 'production') {
  validateProductionEnv(env);
}

export { env };
export type { AppEnv, DeploymentMode, LlmProvider, StorageDriver };
