import path from 'node:path';

import dotenv from 'dotenv';

import {
  required,
  resolveChaosRate,
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

import type {
  AppEnv,
  DeploymentMode,
  EmbeddingsProvider,
  LlmProvider,
  RerankerProvider,
  StorageDriver,
} from './env.types';

// Skip in jest runs so .env doesn't contaminate controlled-env tests.
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
    // SEC-HARDENING (H12): prod BANS legacy JWT_SECRET fallback; explicit
    // JWT_ACCESS_SECRET + JWT_REFRESH_SECRET required. Dev/test still honour
    // JWT_SECRET. Length/legacy assertions in env.production-validation.ts.
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
    // F8 (2026-04-30) — refresh TTL tightened 30d -> 14d absolute. Existing
    // 30d-minted tokens remain valid until natural expiry (JWT carries own exp).
    refreshTokenTtl: process.env.JWT_REFRESH_TTL || '14d',
    // F8 — sliding idle window tightened 14d -> 24h. Server-side check on
    // last_rotated_at: any user idle >24h re-authenticates on next refresh.
    refreshIdleWindowSeconds: toNumber(process.env.JWT_REFRESH_IDLE_WINDOW_SECONDS, 24 * 60 * 60),
    appleClientId: process.env.APPLE_CLIENT_ID || 'com.musaium.mobile',
    googleClientIds: (() => {
      // Mobile audience IDs from comma-separated GOOGLE_OAUTH_CLIENT_ID.
      // Web client ID (F11 redirect flow) auto-merged so JWT-audience check in
      // social-token-verifier accepts id_tokens minted for web app without
      // forcing operators to keep two env vars in sync.
      const fromList = toList(process.env.GOOGLE_OAUTH_CLIENT_ID);
      const webId = toOptionalString(process.env.GOOGLE_OAUTH_WEB_CLIENT_ID);
      return webId && !fromList.includes(webId) ? [...fromList, webId] : fromList;
    })(),
    appleJwksUrl: process.env.APPLE_OIDC_JWKS_URL || 'https://appleid.apple.com/auth/keys',
    googleJwksUrl: process.env.GOOGLE_OIDC_JWKS_URL || 'https://www.googleapis.com/oauth2/v3/certs',
    // R16 MFA — AES-256-GCM key for TOTP secrets at rest. Dev/test fall back to
    // deterministic 32-byte dev key. Prod fatal (env.production-validation.ts);
    // MUST be distinct from JWT_* and MEDIA_SIGNING_SECRET (L3 / H12 pattern).
    mfaEncryptionKey: isDev
      ? toOptionalString(process.env.MFA_ENCRYPTION_KEY) ||
        // 32 base64-decoded bytes — dev only. Prod fail-fast blocks this surfacing.
        'ZGV2LW1mYS1lbmNyeXB0aW9uLWtleS0zMmJ5dGVzLWxvY2Fs'
      : required('MFA_ENCRYPTION_KEY', toOptionalString(process.env.MFA_ENCRYPTION_KEY)),
    mfaSessionTokenSecret: isDev
      ? toOptionalString(process.env.MFA_SESSION_TOKEN_SECRET) ||
        toOptionalString(process.env.JWT_ACCESS_SECRET) ||
        'local-dev-mfa-session-secret'
      : required(
          'MFA_SESSION_TOKEN_SECRET',
          toOptionalString(process.env.MFA_SESSION_TOKEN_SECRET),
        ),
    mfaSessionTokenTtlSeconds: toNumber(process.env.MFA_SESSION_TOKEN_TTL_SECONDS, 300),
    mfaEnrollmentWarningDays: toNumber(process.env.MFA_ENROLLMENT_WARNING_DAYS, 30),
    // F3 — default false during mobile rollout. Flip to true once every
    // supported mobile build ships the OIDC nonce flow.
    oidcNonceEnforce: toBoolean(process.env.OIDC_NONCE_ENFORCE, false),
    // F11 (2026-05) — Server-driven Google OAuth for museum-web admin. All
    // three values required together; otherwise routes return 503. Mobile unaffected.
    googleWebOauth: {
      clientId: toOptionalString(process.env.GOOGLE_OAUTH_WEB_CLIENT_ID),
      clientSecret: toOptionalString(process.env.GOOGLE_OAUTH_WEB_CLIENT_SECRET),
      redirectUri: toOptionalString(process.env.GOOGLE_OAUTH_REDIRECT_URI),
    },
    // F7 — HMAC key for CSRF double-submit tokens. Required in prod, distinct
    // from every other signing secret (env.production-validation.ts).
    csrfSecret: isDev
      ? toOptionalString(process.env.CSRF_SECRET) || 'local-dev-csrf-secret-32chars-minimum'
      : required('CSRF_SECRET', toOptionalString(process.env.CSRF_SECRET)),
    // Phase 5 — 'test' enables in-memory capture for e2e. Prod rejects 'test'
    // (env.production-validation.ts). Default 'brevo'.
    emailServiceKind:
      (process.env.AUTH_EMAIL_SERVICE_KIND as 'test' | 'brevo' | 'noop' | undefined) ?? 'brevo',
    // JUSTIFIED: e2e harness skips HIBP API to avoid blocking test suite on
    // every register call. Prod sentinel rejects false. Pre-launch V1 doctrine.
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
    // F13 (2026-04-30) — diagnostics ONLY in strict `development`. Staging/test
    // default false, prod hard-disabled. Guards against NODE_ENV typo silently
    // exposing model internals / prompt fragments.
    includeDiagnostics:
      nodeEnv === 'development' ? toBoolean(process.env.LLM_INCLUDE_DIAGNOSTICS, true) : false,
    openAiApiKey: process.env.OPENAI_API_KEY,
    deepseekApiKey: process.env.DEEPSEEK_API_KEY,
    googleApiKey: process.env.GOOGLE_API_KEY,
    // P0-4 (audit 2026-05-12) — operational kill-switch + per-user daily USD
    // ceiling. NOT a feature flag: `killSwitch` = global panic button (env
    // reload + restart, fail-CLOSED). Wired through `LlmCostGuard` at the HTTP
    // seam. Rollback = `git revert` (pre-launch V1 doctrine).
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
    // F2 — fail-closed when Redis configured-but-down. True in prod, false in
    // dev/test so local stacks without Redis are unaffected.
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
  // TTS_ENABLED retired V1 2026-04 — voice pipeline always on. See docs/AI_VOICE.md.
  tts: {
    model: process.env.TTS_MODEL || 'gpt-4o-mini-tts',
    voice: process.env.TTS_VOICE || 'alloy',
    speed: toNumber(process.env.TTS_SPEED, 1),
    maxTextLength: toNumber(process.env.TTS_MAX_TEXT_LENGTH, 4096),
    cacheTtlSeconds: toNumber(process.env.TTS_CACHE_TTL_SECONDS, 86400),
  },
  // Pre-launch V1: cache active when REDIS_URL set, otherwise undefined (no
  // separate CACHE_ENABLED flag). Prod validation enforces REDIS_URL presence.
  cache: toOptionalString(process.env.REDIS_URL)
    ? {
        enabled: true,
        url: (process.env.REDIS_URL ?? '').trim(),
        password: parseRedisUrlFallback().password,
        sessionTtlSeconds: toNumber(process.env.CACHE_SESSION_TTL_SECONDS, 3600),
        listTtlSeconds: toNumber(process.env.CACHE_LIST_TTL_SECONDS, 300),
        // LLM TTL constants live in `llm-cache.service.ts` (ADR-036) — env
        // knobs feeding deleted L2 decorator removed (PR-B 2026-05-08).
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
  // JUSTIFIED: OTel heavy in local dev without collector — explicit opt-in.
  otel: toBoolean(process.env.OTEL_ENABLED, false)
    ? {
        enabled: true,
        exporterEndpoint: process.env.OTEL_EXPORTER_ENDPOINT || 'http://localhost:4318',
        serviceName: process.env.OTEL_SERVICE_NAME || 'museum-backend',
      }
    : undefined,
  // JUSTIFIED: Langfuse SaaS — keys not available in local dev. Explicit opt-in.
  // Host resolution supports both Musaium internal naming (LANGFUSE_HOST) and
  // upstream SDK convention (LANGFUSE_BASEURL / LANGFUSE_BASE_URL) so a copy-paste
  // from Langfuse official docs does not silently fall back to localhost. Default
  // points to cloud (fail-loud auth error in logs) rather than localhost:3002
  // (fail-silent drop into the void). 2026-05-17 hotfix — see Langfuse activation
  // post-mortem in this commit message.
  langfuse: toBoolean(process.env.LANGFUSE_ENABLED, false)
    ? {
        enabled: true,
        publicKey: toOptionalString(process.env.LANGFUSE_PUBLIC_KEY),
        secretKey: toOptionalString(process.env.LANGFUSE_SECRET_KEY),
        host:
          process.env.LANGFUSE_HOST ||
          process.env.LANGFUSE_BASEURL ||
          process.env.LANGFUSE_BASE_URL ||
          'https://cloud.langfuse.com',
      }
    : undefined,
  // 2026-04-22: all feature flags retired — every feature is always-on.
  // Required infra (Redis, OpenAI key) must be provided in prod.
  freeTierDailyChatLimit: toNumber(process.env.FREE_TIER_DAILY_CHAT_LIMIT, 100),
  freeTierMonthlySessionLimit: toNumber(process.env.FREE_TIER_MONTHLY_SESSION_LIMIT, 3),
  overpassCacheTtlSeconds: toNumber(process.env.OVERPASS_CACHE_TTL_SECONDS, 86400),
  overpass: {
    cacheTtlSeconds: toNumber(process.env.OVERPASS_CACHE_TTL_SECONDS, 86_400),
    negativeCacheTtlSeconds: toNumber(process.env.OVERPASS_NEGATIVE_CACHE_TTL_SECONDS, 3_600),
  },
  chatPurgeRetentionDays: toNumber(process.env.CHAT_PURGE_RETENTION_DAYS, 180),
  // B5 (D5) — orphan-purge retention window. Separate from chatPurgeRetentionDays
  // so the two windows can diverge. Config value, not a feature flag (UFR-015).
  s3OrphanPurgeRetentionDays: toNumber(process.env.S3_ORPHAN_PURGE_RETENTION_DAYS, 180),
  knowledgeBase: {
    timeoutMs: toNumber(process.env.KB_TIMEOUT_MS, 500),
    cacheTtlSeconds: toNumber(process.env.KB_CACHE_TTL_SECONDS, 3600),
    cacheMaxEntries: toNumber(process.env.KB_CACHE_MAX_ENTRIES, 500),
    // C5.1 Wikidata circuit-breaker — no *_ENABLED switch (pre-launch V1).
    breaker: {
      timeoutMs: toNumber(process.env.WIKIDATA_CB_TIMEOUT_MS, 5000),
      errorThresholdPercentage: toNumber(process.env.WIKIDATA_CB_ERROR_THRESHOLD_PCT, 50),
      resetTimeoutMs: toNumber(process.env.WIKIDATA_CB_RESET_TIMEOUT_MS, 30000),
      volumeThreshold: toNumber(process.env.WIKIDATA_CB_VOLUME_THRESHOLD, 5),
      capacity: toNumber(process.env.WIKIDATA_CB_CAPACITY, 5),
    },
    // C5.3 cascade — soak window before falling back to local dump.
    localDumpFallbackAfterMs: toNumber(process.env.LOCAL_DUMP_FALLBACK_AFTER_MS, 60_000),
  },
  wikidata: {
    userAgent:
      toOptionalString(process.env.WIKIDATA_USER_AGENT) ||
      'Musaium/1.0 (https://musaium.com; contact@musaium.com)',
  },
  // C4.1 (2026-05-11) — KnowledgeRouter. TUNING-ONLY: no `*_ENABLED` flag may
  // be added (D11 / pre-launch V1 doctrine). Rollback = `git revert`.
  // `KNOWLEDGE_ROUTER_*` namespace avoids colliding with `KB_TIMEOUT_MS` (500ms,
  // outer cache wrapper). Router enforces per-leg budget on top (200ms, design D4).
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
  // C3 (2026-05) — visual similarity engine. Additive, no impact until
  // `/chat/compare` ships (Phase 6 wiring).
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
  // C9.13 (2026-05-18) — cross-encoder reranker. Defaults select the no-op
  // `NullRerankerAdapter` (V1 prod default, zero behavior change). Flip
  // `RERANK_PROVIDER=bge-reranker-v2-m3` to activate the scaffold (still
  // fail-open in V1, real inference lands in C9.13.1). Rollback = `git revert`
  // or `RERANK_PROVIDER=null`. No `*_ENABLED` flag (UFR-015 / pre-launch V1).
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
  // JUSTIFIED: e2e harness opts out (no Redis) to avoid BullMQ/ioredis
  // ECONNREFUSED log floods. Prod sentinel rejects false. Pre-launch V1.
  extractionWorkerEnabled: toBoolean(process.env.EXTRACTION_WORKER_ENABLED, true),
  // JUSTIFIED: producer wired but no `MuseumEnrichmentWorker` consumer
  // instantiated at boot → leaving scheduler on queues jobs nothing drains.
  // Flip on (delete flag) once consumer wired. Pre-launch V1 carry-over.
  museumEnrichmentSchedulerEnabled: toBoolean(
    process.env.MUSEUM_ENRICHMENT_SCHEDULER_ENABLED,
    false,
  ),
  redis: {
    ...parseRedisUrlFallback(),
  },
  guardrails: {
    llmGuardUrl: toOptionalString(process.env.GUARDRAILS_V2_LLM_GUARD_URL),
    // 2026-05-12 — raised from 300/500ms after prod incident: sidecar P95
    // inference on CPU-only VPS exceeded 500ms → 100% fail-CLOSED canned
    // refusals. 1500ms gives ~3-4× headroom over local MPS bench (375ms P95).
    // Circuit breaker below absorbs rare residual timeout (ADR-047).
    timeoutMs: toNumber(process.env.GUARDRAILS_V2_TIMEOUT_MS, 1500),
    observeOnly: toBoolean(process.env.GUARDRAILS_V2_OBSERVE_ONLY, false),
    // F4 (2026-04-30) — LLM judge daily cost cap (cents). Default 500 ($5/day)
    // activates judge in parallel with sidecar (defense-in-depth, ADR-015
    // amendment 2026-05-14). Set to `0` to disable judge layer.
    budgetCentsPerDay: toNumber(process.env.LLM_GUARDRAIL_BUDGET_CENTS_PER_DAY, 500),
    judgeTimeoutMs: toNumber(process.env.LLM_GUARDRAIL_JUDGE_TIMEOUT_MS, 500),
    judgeMinMessageLength: toNumber(process.env.LLM_GUARDRAIL_JUDGE_MIN_LENGTH, 50),
    // ADR-030 (2026-05-05) — judge budget backend.
    // 'memory' = per-process (dev/test/single-instance). 'redis' = shared via
    // SET INCRBY + TTL. Default 'redis' in prod (multi-instance no 2× spend);
    // tests pin 'memory' to avoid coupling to Redis container.
    budgetBackend: process.env.GUARDRAIL_BUDGET_BACKEND === 'memory' ? 'memory' : 'redis',
    // 2026-05-12 — LLM Guard sidecar circuit breaker. NOT a feature flag —
    // always-on (pre-launch V1). Emergency disable =
    // `LLM_GUARD_CB_FAILURE_THRESHOLD=1000000`. Real rollback = `git revert`.
    circuitBreaker: {
      failureThreshold: toNumber(process.env.LLM_GUARD_CB_FAILURE_THRESHOLD, 5),
      windowMs: toNumber(process.env.LLM_GUARD_CB_WINDOW_MS, 60_000),
      openDurationMs: toNumber(process.env.LLM_GUARD_CB_OPEN_DURATION_MS, 30_000),
      halfOpenMaxProbes: toNumber(process.env.LLM_GUARD_CB_HALF_OPEN_MAX_PROBES, 1),
    },
    // 2026-05-12 (ADR-047) — in-flight concurrency cap on /scan. Prevents
    // surge amplifying sidecar latency into death spiral. Overflow = fail-CLOSED.
    maxInflight: toNumber(process.env.LLM_GUARD_MAX_INFLIGHT, 8),
    queueMax: toNumber(process.env.LLM_GUARD_QUEUE_MAX, 32),
    // ADR-051 (2026-05-13) — OSS provider adapters READY but NOT activated.
    // Adapters ship behind ADR-048 port so Phase 1 shadow swap is
    // constructor-injection, not refactor. Composition root does NOT wire
    // either until ADR-051 promotion criteria pass (≥7d shadow, decision-match
    // thresholds, p95 latency).
    presidio: {
      /**
       * C9.8 (2026-05-17) — when true AND `baseUrl` set, the chat pipeline
       * uses MicrosoftPresidioAdapter as the V2 guardrail provider. Combine
       * with `GUARDRAILS_V2_OBSERVE_ONLY=true` for the 4-7d bake before
       * flipping to enforce. ADR-051.
       */
      enabled: toBoolean(process.env.PRESIDIO_ENABLED, false),
      baseUrl: toOptionalString(process.env.PRESIDIO_BASE_URL),
      timeoutMs: toNumber(process.env.PRESIDIO_TIMEOUT_MS, 500),
    },
    // Chaos drill rate (0..1). Non-zero values intentionally abort /scan
    // calls to exercise fail-CLOSED path. Prod MUST be 0 — `resolveChaosRate`
    // refuses non-zero in prod unless `MUSAIUM_ALLOW_PROD_CHAOS` set verbatim.
    // Spec §6 RO3.
    chaosRate: resolveChaosRate(
      process.env.GUARDRAIL_CHAOS_RATE,
      process.env.NODE_ENV,
      process.env.MUSAIUM_ALLOW_PROD_CHAOS,
    ),
    // 2026-05-13 — 100k-clients scalability primitives (perennial design §11).
    // Operational tunables, NOT feature flags. Defaults from CAPACITY_PLAN_100K.md.
    costCircuitBreaker: {
      hourlyThresholdCents: toNumber(process.env.COST_CB_HOURLY_THRESHOLD_CENTS, 5_000),
      dailyBudgetCents: toNumber(process.env.COST_CB_DAILY_BUDGET_CENTS, 50_000),
      openDurationMs: toNumber(process.env.COST_CB_OPEN_DURATION_MS, 300_000),
    },
    tenantRateLimit: {
      capacity: toNumber(process.env.TENANT_RATE_LIMIT_CAPACITY, 60),
      refillPerSecond: toNumber(process.env.TENANT_RATE_LIMIT_REFILL_PER_SEC, 1),
    },
  },
  // Pre-launch V1: retention crons always-on; `env.cache?.enabled` upstream
  // gate (Redis required) is the skip path for tests/dev without Redis.
  retention: {
    cronPattern: process.env.RETENTION_CRON_PATTERN || '15 3 * * *',
    batchLimit: toNumber(process.env.RETENTION_BATCH_LIMIT, 1000),
    supportTicketsDays: toNumber(process.env.RETENTION_SUPPORT_TICKETS_DAYS, 365),
    reviewsRejectedDays: toNumber(process.env.RETENTION_REVIEWS_REJECTED_DAYS, 30),
    reviewsPendingDays: toNumber(process.env.RETENTION_REVIEWS_PENDING_DAYS, 60),
    artKeywordsDays: toNumber(process.env.RETENTION_ART_KEYWORDS_DAYS, 90),
    artKeywordsHitThreshold: toNumber(process.env.RETENTION_ART_KEYWORDS_HIT_THRESHOLD, 1),
  },
  // Cycle B (« Aucun lead perdu ») — async redelivery + retention for the
  // persisted `leads` table. Config values, NOT feature flags (UFR-015): the
  // cron is always-on pre-launch, structurally skipped only when Redis is
  // absent (mirror `retention`). Default tick every 5 min; backoff
  // exponential 60s→1h; terminal cap 5 attempts; delivered purge after 90 days.
  leads: {
    redeliveryCronPattern: process.env.LEADS_REDELIVERY_CRON_PATTERN || '*/5 * * * *',
    maxAttempts: toNumber(process.env.LEADS_MAX_ATTEMPTS, 5),
    redeliveryBatchLimit: toNumber(process.env.LEADS_REDELIVERY_BATCH_LIMIT, 100),
    retentionDays: toNumber(process.env.LEADS_RETENTION_DAYS, 90),
    backoffBaseMs: toNumber(process.env.LEADS_BACKOFF_BASE_MS, 60_000),
    backoffCapMs: toNumber(process.env.LEADS_BACKOFF_CAP_MS, 3_600_000),
  },
  review: {
    // NPS scale-epoch (F3). The review rating scale switched 1-5 (legacy stars)
    // → 0-10 (NPS) in this release. A legacy "5" is indistinguishable by value
    // from an NPS "5" yet would now be miscounted as a detractor (≤6), poisoning
    // the score on historical data. `aggregateNps` therefore counts ONLY reviews
    // created AT/AFTER this epoch. Default = the 0-10 deploy date; overridable
    // via NPS_SCALE_EPOCH (ISO-8601) for staging back-tests / future re-baselines.
    // Invalid values degrade to the default (toIsoTimestamp warns, never throws).
    // Mirrors the repository resolver (`nps-scale-epoch.ts`) — same default
    // literal + parser. The repository reads its own lightweight resolver (to
    // avoid pulling the DB-coupled env singleton into its static import graph);
    // this field exposes the value for the AppEnv contract / prod validation.
    // Keep the default literal in sync with `NPS_SCALE_EPOCH_DEFAULT`.
    npsScaleEpoch: toIsoTimestamp(process.env.NPS_SCALE_EPOCH, '2026-05-27T00:00:00.000Z'),
  },
  brevoApiKey: toOptionalString(process.env.BREVO_API_KEY),
  supportInboxEmail: toOptionalString(process.env.SUPPORT_INBOX_EMAIL) || 'support@musaium.com',
  // R4 W4.3 — B2B leads inbox. Config value, not a feature flag. Falls back
  // to supportInboxEmail in dev so no env churn for solo contributors.
  b2bInboxEmail: toOptionalString(process.env.B2B_INBOX_EMAIL),
  // R3 W4.2 — Brevo contact-list ID for public beta waitlist. Config value,
  // NOT a feature flag. Empty/non-numeric → composition root wires
  // NoopBetaSignupNotifier; route stays 202 with structured warn log.
  brevoBetaListId: (() => {
    const raw = toOptionalString(process.env.BREVO_BETA_LIST_ID);
    if (!raw) return;
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  })(),
  // R2 W3.4 — Salt for admin CSV export pseudonymization. Config value, NOT a
  // feature flag. Empty → composition root falls back to legacy literal.
  // Rotate manually after a breach.
  exportPseudonymSalt: toOptionalString(process.env.EXPORT_PSEUDONYM_SALT),
  storage: {
    driver: storageDriver,
    // Resolved at parse time so downstream always sees absolute path,
    // independent of `process.cwd()` at call site. Mirrors `LocalImageStorage`
    // default (`<cwd>/tmp/uploads`) so harness — which constructs
    // `new LocalImageStorage()` without override — stays compatible.
    localUploadsDir: path.resolve(
      process.cwd(),
      toOptionalString(process.env.LOCAL_UPLOADS_DIR) ?? path.join('tmp', 'uploads'),
    ),
    signedUrlTtlSeconds: toNumber(process.env.S3_SIGNED_URL_TTL_SECONDS, 900),
    // SEC-HARDENING (L3): prod MUST set MEDIA_SIGNING_SECRET explicitly — no
    // silent fallback to JWT_ACCESS_SECRET / JWT_SECRET. Sharing a single
    // secret across signing domains means rotation/leak of one defeats other.
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
  // Wave C5 (D-C5) — Plausible funnel analytics. Both vars OPTIONAL : if
  // either is unset, the PlausibleAdapter no-ops (silent fallback) so dev /
  // test envs don't accidentally emit. Production validation is delegated to
  // `validateProductionEnv` (warn only — analytics outage MUST NOT block boot).
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
