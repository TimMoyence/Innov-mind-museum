import path from 'node:path';

import dotenv from 'dotenv';

import {
  required,
  resolveChaosRate,
  toBoolean,
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
  resolveStorageDriver,
  warnLegacyJwtSecret,
} from './env-resolvers';
import { validateProductionEnv } from './env.production-validation';

import type {
  AppEnv,
  DeploymentMode,
  EmbeddingsProvider,
  LlmProvider,
  StorageDriver,
} from './env.types';

// Skip in jest runs (NODE_ENV=test) so .env doesn't contaminate controlled-env tests.
if (process.env.NODE_ENV !== 'test') {
  dotenv.config();
}

const nodeEnv = resolveNodeEnv();
const provider = resolveLlmProvider();
const storageDriver = resolveStorageDriver();
const deploymentMode = resolveDeploymentMode();
const embeddingsProvider: EmbeddingsProvider = resolveEmbeddingsProvider();

const isDev = nodeEnv === 'development' || nodeEnv === 'test';
const isProduction = nodeEnv === 'production';

warnLegacyJwtSecret(isProduction);

const resolvedAppVersion = resolveAppVersion();
const resolvedCommitSha = resolveCommitSha();

/** Resolved application configuration singleton, validated at startup. */
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
    database: toOptionalString(process.env.PGDATABASE) || 'museumAI',
    poolMax: toNumber(process.env.DB_POOL_MAX, 50),
    replicaUrl: toOptionalString(process.env.DB_REPLICA_URL) ?? null, // F Phase 2 — read-replica URL
  },
  auth: {
    // SEC-HARDENING (H12): in production, JWT_SECRET legacy fallback is BANNED.
    // Explicit JWT_ACCESS_SECRET + JWT_REFRESH_SECRET are required. In dev/test
    // we still honour JWT_SECRET for local ergonomics. Length / legacy-presence
    // assertions live in env.production-validation.ts.
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
    // F8 (2026-04-30) — refresh TTL tightened from 30d -> 14d absolute. Existing
    // tokens already minted with 30d remain valid until natural expiry (the JWT
    // carries its own exp claim). Only newly issued tokens get the 14d cap.
    refreshTokenTtl: process.env.JWT_REFRESH_TTL || '14d',
    // F8 — sliding idle window tightened from 14d -> 24h. Server-side check on
    // last_rotated_at: any user idle >24h re-authenticates on next refresh.
    // UX impact: casual visitors who skip a day will see a one-time login prompt.
    refreshIdleWindowSeconds: toNumber(process.env.JWT_REFRESH_IDLE_WINDOW_SECONDS, 24 * 60 * 60),
    appleClientId: process.env.APPLE_CLIENT_ID || 'com.musaium.mobile',
    googleClientIds: (() => {
      // Mobile audience IDs come from the comma-separated GOOGLE_OAUTH_CLIENT_ID.
      // The web client ID (F11 redirect flow) is auto-merged so the JWT-audience
      // check in social-token-verifier accepts id_tokens minted for the web app
      // without forcing operators to keep two env vars in sync manually.
      const fromList = toList(process.env.GOOGLE_OAUTH_CLIENT_ID);
      const webId = toOptionalString(process.env.GOOGLE_OAUTH_WEB_CLIENT_ID);
      return webId && !fromList.includes(webId) ? [...fromList, webId] : fromList;
    })(),
    // Phase 5 — JWKS endpoint URLs for social-login token verification. Default
    // to the canonical provider URLs. Overridable via env for e2e test spoofing.
    appleJwksUrl: process.env.APPLE_OIDC_JWKS_URL || 'https://appleid.apple.com/auth/keys',
    googleJwksUrl: process.env.GOOGLE_OIDC_JWKS_URL || 'https://www.googleapis.com/oauth2/v3/certs',
    // R16 MFA — AES-256-GCM key for TOTP secrets at rest. In dev/test we
    // tolerate absence and fall back to a deterministic 32-byte dev key so the
    // module boots without extra ceremony. In production, the absence of an
    // explicit value is fatal (enforced in env.production-validation.ts) and
    // the key MUST be distinct from JWT_* and MEDIA_SIGNING_SECRET (see L3 /
    // H12 hardening pattern).
    mfaEncryptionKey: isDev
      ? toOptionalString(process.env.MFA_ENCRYPTION_KEY) ||
        // 32 base64-decoded bytes — only used when the operator did not bother
        // to set the var locally. Production fail-fast prevents this surfacing
        // in prod even by accident.
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
    // F3 — default false during the mobile rollout window. Flip to true after
    // every supported mobile build ships the OIDC nonce flow.
    oidcNonceEnforce: toBoolean(process.env.OIDC_NONCE_ENFORCE, false),
    // F11 (2026-05) — Server-driven Google OAuth flow for museum-web admin.
    // All three values must be set together for the /google/initiate + /callback
    // routes to be live; otherwise the routes return 503. Mobile is unaffected.
    googleWebOauth: {
      clientId: toOptionalString(process.env.GOOGLE_OAUTH_WEB_CLIENT_ID),
      clientSecret: toOptionalString(process.env.GOOGLE_OAUTH_WEB_CLIENT_SECRET),
      redirectUri: toOptionalString(process.env.GOOGLE_OAUTH_REDIRECT_URI),
    },
    // F7 — HMAC key for CSRF double-submit tokens. Required in prod, distinct
    // from every other signing secret (enforced in env.production-validation.ts).
    csrfSecret: isDev
      ? toOptionalString(process.env.CSRF_SECRET) || 'local-dev-csrf-secret-32chars-minimum'
      : required('CSRF_SECRET', toOptionalString(process.env.CSRF_SECRET)),
    // Phase 5 — email service implementation selector. 'test' enables in-memory
    // capture for e2e tests. Production rejects 'test' loudly (sentinel in
    // env.production-validation.ts). Default 'brevo'.
    emailServiceKind:
      (process.env.AUTH_EMAIL_SERVICE_KIND as 'test' | 'brevo' | 'noop' | undefined) ?? 'brevo',
    // JUSTIFIED: e2e harness needs to skip third-party HIBP API to avoid
    // blocking the test suite on every register call. Production sentinel
    // (env.production-validation.ts) rejects false. Pre-launch V1 doctrine.
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
    // F13 (2026-04-30) — diagnostics ONLY enabled in strict `development`. Staging
    // and test default to `false`; production is hard-disabled. Guards against a
    // NODE_ENV typo (e.g. `staging`) silently exposing model internals / prompt
    // fragments to staging users or logs. Operators can still opt in for local
    // debugging in dev via the env var.
    includeDiagnostics:
      nodeEnv === 'development' ? toBoolean(process.env.LLM_INCLUDE_DIAGNOSTICS, true) : false,
    openAiApiKey: process.env.OPENAI_API_KEY,
    deepseekApiKey: process.env.DEEPSEEK_API_KEY,
    googleApiKey: process.env.GOOGLE_API_KEY,
    // P0-4 (audit 2026-05-12) — operational kill-switch + per-user daily USD
    // ceiling for paid LLM calls. NOT a feature flag: `killSwitch` is the
    // global panic button (flip via env reload + restart, fail-CLOSED). Wired
    // through `LlmCostGuard` at the HTTP seam (see
    // `src/helpers/middleware/llm-cost-guard.middleware.ts`). Pré-launch V1
    // doctrine: rollback path is `git revert`, not a flag.
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
    // F2 — fail-closed when Redis is configured-but-down. Defaults to true in prod,
    // false in dev/test so local stacks without Redis are unaffected.
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
  // TTS_ENABLED retired (V1 2026-04) — voice pipeline always on. See docs/AI_VOICE.md.
  tts: {
    model: process.env.TTS_MODEL || 'gpt-4o-mini-tts',
    voice: process.env.TTS_VOICE || 'alloy',
    speed: toNumber(process.env.TTS_SPEED, 1),
    maxTextLength: toNumber(process.env.TTS_MAX_TEXT_LENGTH, 4096),
    cacheTtlSeconds: toNumber(process.env.TTS_CACHE_TTL_SECONDS, 86400),
  },
  // Pre-launch V1 doctrine: cache is active when REDIS_URL is set, otherwise
  // undefined (no separate CACHE_ENABLED flag). Production validation
  // (env.production-validation.ts) enforces REDIS_URL presence.
  cache: toOptionalString(process.env.REDIS_URL)
    ? {
        enabled: true,
        url: (process.env.REDIS_URL ?? '').trim(),
        password: parseRedisUrlFallback().password,
        sessionTtlSeconds: toNumber(process.env.CACHE_SESSION_TTL_SECONDS, 3600),
        listTtlSeconds: toNumber(process.env.CACHE_LIST_TTL_SECONDS, 300),
        // LLM TTL constants live in `llm-cache.service.ts` per ADR-036 — the
        // env knobs that previously fed the deleted L2 decorator have been
        // removed (PR-B 2026-05-08).
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
  // JUSTIFIED: OTel is heavy in local dev without a collector — explicit opt-in
  // keeps the dev loop fast. Prod sets OTEL_ENABLED=true via deploy env.
  otel: toBoolean(process.env.OTEL_ENABLED, false)
    ? {
        enabled: true,
        exporterEndpoint: process.env.OTEL_EXPORTER_ENDPOINT || 'http://localhost:4318',
        serviceName: process.env.OTEL_SERVICE_NAME || 'museum-backend',
      }
    : undefined,
  // JUSTIFIED: Langfuse SaaS observability — keys are not available in local dev.
  // Explicit opt-in for prod via LANGFUSE_ENABLED=true + keys in deploy env.
  langfuse: toBoolean(process.env.LANGFUSE_ENABLED, false)
    ? {
        enabled: true,
        publicKey: toOptionalString(process.env.LANGFUSE_PUBLIC_KEY),
        secretKey: toOptionalString(process.env.LANGFUSE_SECRET_KEY),
        host: process.env.LANGFUSE_HOST || 'http://localhost:3002',
      }
    : undefined,
  // 2026-04-22: all feature flags retired. Every feature is always-on.
  //   (OCR guard, API keys, knowledge extraction, guardrail V2 enforcement.)
  //   Required infra (Redis, OpenAI key) must be provided in prod.
  freeTierDailyChatLimit: toNumber(process.env.FREE_TIER_DAILY_CHAT_LIMIT, 100),
  freeTierMonthlySessionLimit: toNumber(process.env.FREE_TIER_MONTHLY_SESSION_LIMIT, 3),
  overpassCacheTtlSeconds: toNumber(process.env.OVERPASS_CACHE_TTL_SECONDS, 86400),
  overpass: {
    cacheTtlSeconds: toNumber(process.env.OVERPASS_CACHE_TTL_SECONDS, 86_400),
    negativeCacheTtlSeconds: toNumber(process.env.OVERPASS_NEGATIVE_CACHE_TTL_SECONDS, 3_600),
  },
  chatPurgeRetentionDays: toNumber(process.env.CHAT_PURGE_RETENTION_DAYS, 180),
  knowledgeBase: {
    timeoutMs: toNumber(process.env.KB_TIMEOUT_MS, 500),
    cacheTtlSeconds: toNumber(process.env.KB_CACHE_TTL_SECONDS, 3600),
    cacheMaxEntries: toNumber(process.env.KB_CACHE_MAX_ENTRIES, 500),
    // C5.1 Wikidata circuit-breaker tuning — no *_ENABLED switch (pré-launch V1 doctrine).
    breaker: {
      timeoutMs: toNumber(process.env.WIKIDATA_CB_TIMEOUT_MS, 5000),
      errorThresholdPercentage: toNumber(process.env.WIKIDATA_CB_ERROR_THRESHOLD_PCT, 50),
      resetTimeoutMs: toNumber(process.env.WIKIDATA_CB_RESET_TIMEOUT_MS, 30000),
      volumeThreshold: toNumber(process.env.WIKIDATA_CB_VOLUME_THRESHOLD, 5),
      capacity: toNumber(process.env.WIKIDATA_CB_CAPACITY, 5),
    },
    // C5.3 cascade — soak window before falling back to the local dump.
    localDumpFallbackAfterMs: toNumber(process.env.LOCAL_DUMP_FALLBACK_AFTER_MS, 60_000),
  },
  wikidata: {
    userAgent:
      toOptionalString(process.env.WIKIDATA_USER_AGENT) ||
      'Musaium/1.0 (https://musaium.app; contact@musaium.app)',
  },
  // C4.1 (2026-05-11) — KnowledgeRouter tuning. TUNING-ONLY block: there is NO
  // `*_ENABLED` flag here and none can be added (D11 / pré-launch V1 doctrine
  // — see `feedback_no_feature_flags_prelaunch`). Rollback = `git revert`.
  //
  // Names are namespaced with `KNOWLEDGE_ROUTER_*` to avoid colliding with the
  // pre-existing `KB_TIMEOUT_MS` (500 ms — used by `KnowledgeBaseService` for
  // its outer cache wrapper). The router enforces its own per-leg budget on
  // top of that with `KNOWLEDGE_ROUTER_KB_TIMEOUT_MS` (200 ms by design.md D4).
  knowledgeRouter: {
    /** Confidence cutoff [0..1] above which WebSearch is skipped (default 0.7). */
    threshold: toNumber(process.env.WEBSEARCH_FALLBACK_THRESHOLD, 0.7),
    /** Per-leg KB lookup budget in ms (default 200; see design.md §9 D4). */
    kbTimeoutMs: toNumber(process.env.KNOWLEDGE_ROUTER_KB_TIMEOUT_MS, 200),
    /** Per-leg judge budget in ms (default 500). */
    judgeTimeoutMs: toNumber(process.env.KNOWLEDGE_ROUTER_JUDGE_TIMEOUT_MS, 500),
    /** Per-leg WebSearch budget in ms (default 1500). */
    wsTimeoutMs: toNumber(process.env.KNOWLEDGE_ROUTER_WS_TIMEOUT_MS, 1500),
  },
  nominatim: {
    contactEmail: toOptionalString(process.env.NOMINATIM_CONTACT_EMAIL) || 'contact@musaium.app',
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
  // C3 (2026-05) — visual similarity engine config. Additive block, no impact
  // on existing pipelines until `/chat/compare` ships (Phase 6 wiring).
  visualSimilarity: {
    provider: embeddingsProvider,
    siglipOnnxModelPath:
      toOptionalString(process.env.SIGLIP_ONNX_MODEL_PATH) ??
      './models/siglip-base-patch16-224.onnx',
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
  enrichment: {
    hardDeleteAfterDays: toNumber(process.env.ENRICHMENT_HARD_DELETE_AFTER_DAYS, 180),
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
  // JUSTIFIED: e2e harness opts out (no Redis) to avoid BullMQ/ioredis
  // ECONNREFUSED log floods. Production sentinel rejects false. Pre-launch V1.
  extractionWorkerEnabled: toBoolean(process.env.EXTRACTION_WORKER_ENABLED, true),
  // JUSTIFIED: the producer is wired but no `MuseumEnrichmentWorker` consumer
  // is instantiated at boot, so leaving the scheduler always-on would queue
  // jobs that nothing drains. Will flip to always-on (and the flag will be
  // deleted) once the consumer is wired. Pre-launch V1 carry-over.
  museumEnrichmentSchedulerEnabled: toBoolean(
    process.env.MUSEUM_ENRICHMENT_SCHEDULER_ENABLED,
    false,
  ),
  redis: {
    ...parseRedisUrlFallback(),
    clusterNodes: toOptionalString(process.env.REDIS_CLUSTER_NODES) ?? null,
  },
  guardrails: {
    llmGuardUrl: toOptionalString(process.env.GUARDRAILS_V2_LLM_GUARD_URL),
    // 2026-05-12 — raised from 300/500ms after a prod incident where the
    // sidecar P95 inference on the CPU-only VPS exceeded 500ms, causing
    // 100 % fail-CLOSED canned refusals on every chat message. 1500ms gives
    // ~3-4× headroom over the local MPS bench (375ms P95), matching the
    // typical CPU/MPS perf gap for transformer inference. The circuit
    // breaker below absorbs the rare residual timeout. See
    // `team-state/2026-05-12-llm-guard-circuit-breaker/`.
    timeoutMs: toNumber(process.env.GUARDRAILS_V2_TIMEOUT_MS, 1500),
    observeOnly: toBoolean(process.env.GUARDRAILS_V2_OBSERVE_ONLY, false),
    // F4 (2026-04-30) — LLM judge layer daily cost cap (cents). Default 500
    // ($5/day) activates the structured-output judge in parallel with the
    // sidecar (defense-in-depth, ADR-015 amendment 2026-05-14 — both layers
    // now run together rather than via the retired mutually-exclusive
    // `GUARDRAILS_V2_CANDIDATE` flag). Set to `0` to disable the judge layer.
    budgetCentsPerDay: toNumber(process.env.LLM_GUARDRAIL_BUDGET_CENTS_PER_DAY, 500),
    judgeTimeoutMs: toNumber(process.env.LLM_GUARDRAIL_JUDGE_TIMEOUT_MS, 500),
    judgeMinMessageLength: toNumber(process.env.LLM_GUARDRAIL_JUDGE_MIN_LENGTH, 50),
    // ADR-030 (2026-05-05) — backend store for the cumulative judge budget.
    // 'memory' = per-process counter (acceptable for dev/test/single-instance).
    // 'redis'  = shared counter across replicas via SET INCRBY + TTL.
    // Default is 'redis' in production so multi-instance deploys do not 2× spend;
    // tests pin 'memory' to avoid coupling to a Redis container.
    budgetBackend: process.env.GUARDRAIL_BUDGET_BACKEND === 'memory' ? 'memory' : 'redis',
    // 2026-05-12 — operational tunables for the LLM Guard sidecar circuit
    // breaker (`adapters/secondary/guardrails/guardrail-circuit-breaker.ts`).
    // These are NOT feature flags — the breaker is always-on per pré-launch
    // V1 doctrine (`feedback_no_feature_flags_prelaunch`). The values let
    // operators tune trip sensitivity without a redeploy ; emergency
    // disable is `LLM_GUARD_CB_FAILURE_THRESHOLD=1000000` (effectively never
    // trips). Real rollback path is `git revert` of the wiring. Defaults
    // derived from the existing `LLMCircuitBreaker` envelope.
    circuitBreaker: {
      failureThreshold: toNumber(process.env.LLM_GUARD_CB_FAILURE_THRESHOLD, 5),
      windowMs: toNumber(process.env.LLM_GUARD_CB_WINDOW_MS, 60_000),
      openDurationMs: toNumber(process.env.LLM_GUARD_CB_OPEN_DURATION_MS, 30_000),
      halfOpenMaxProbes: toNumber(process.env.LLM_GUARD_CB_HALF_OPEN_MAX_PROBES, 1),
    },
    // 2026-05-12 (ADR-047) — in-flight concurrency cap on /scan calls. Caps
    // fan-out so a traffic surge can't amplify sidecar latency into a death
    // spiral. NOT a feature flag — operational tunables. Overflow returns
    // fail-CLOSED (preserves safety contract).
    maxInflight: toNumber(process.env.LLM_GUARD_MAX_INFLIGHT, 8),
    queueMax: toNumber(process.env.LLM_GUARD_QUEUE_MAX, 32),
    // ADR-051 (2026-05-13) — OSS provider adapters READY but NOT activated.
    // Pre-launch V1 doctrine: ship the adapters behind the ADR-048 port so a
    // Phase 1 shadow-mode swap is a constructor-injection swap, NOT a refactor.
    // No `.env` entries default these to set values — composition root does NOT
    // wire either provider until ADR-051 promotion criteria pass (≥7d shadow,
    // decision-match thresholds, p95 latency).
    presidio: {
      baseUrl: toOptionalString(process.env.PRESIDIO_BASE_URL),
      timeoutMs: toNumber(process.env.PRESIDIO_TIMEOUT_MS, 500),
    },
    llamaPromptGuard: {
      baseUrl: toOptionalString(process.env.LLAMA_PROMPT_GUARD_BASE_URL),
      timeoutMs: toNumber(process.env.LLAMA_PROMPT_GUARD_TIMEOUT_MS, 500),
      scoreThreshold: toNumber(process.env.LLAMA_PROMPT_GUARD_SCORE_THRESHOLD, 0.8),
    },
    // Chaos drill rate (0..1). Inactive by default; non-zero values
    // intentionally abort LLM Guard /scan calls to exercise the fail-CLOSED
    // path. Production MUST keep this at 0 — see `resolveChaosRate` runtime
    // guard which refuses non-zero values in NODE_ENV=production unless the
    // `MUSAIUM_ALLOW_PROD_CHAOS` escape hatch is set verbatim. Spec §6 RO3.
    chaosRate: resolveChaosRate(
      process.env.GUARDRAIL_CHAOS_RATE,
      process.env.NODE_ENV,
      process.env.MUSAIUM_ALLOW_PROD_CHAOS,
    ),
    // 2026-05-13 — Scalability primitives for 100k clients prep (perennial
    // design §11). Operational tunables, NOT feature flags
    // (`feedback_no_feature_flags_prelaunch`). Defaults derived from
    // CAPACITY_PLAN_100K.md cost / abuse risk modelling.
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
  // Pre-launch V1: retention crons always-on; the `env.cache?.enabled` upstream
  // gate (Redis required) is the structural skip path for tests/dev without Redis.
  retention: {
    cronPattern: process.env.RETENTION_CRON_PATTERN || '15 3 * * *',
    batchLimit: toNumber(process.env.RETENTION_BATCH_LIMIT, 1000),
    supportTicketsDays: toNumber(process.env.RETENTION_SUPPORT_TICKETS_DAYS, 365),
    reviewsRejectedDays: toNumber(process.env.RETENTION_REVIEWS_REJECTED_DAYS, 30),
    reviewsPendingDays: toNumber(process.env.RETENTION_REVIEWS_PENDING_DAYS, 60),
    artKeywordsDays: toNumber(process.env.RETENTION_ART_KEYWORDS_DAYS, 90),
    artKeywordsHitThreshold: toNumber(process.env.RETENTION_ART_KEYWORDS_HIT_THRESHOLD, 1),
  },
  brevoApiKey: toOptionalString(process.env.BREVO_API_KEY),
  supportInboxEmail: toOptionalString(process.env.SUPPORT_INBOX_EMAIL) || 'support@musaium.app',
  // R4 W4.3 — B2B leads inbox. Config value, not a feature flag (cf.
  // AUDIT_CHAIN_ALERT_EMAIL precedent). Falls back to supportInboxEmail in
  // local dev so no env churn for solo contributors.
  b2bInboxEmail: toOptionalString(process.env.B2B_INBOX_EMAIL),
  // R3 W4.2 — Brevo contact-list ID for the public beta waitlist. Config
  // value (numeric Brevo list ID), NOT a feature flag (mirror b2bInboxEmail /
  // AUDIT_CHAIN_ALERT_EMAIL precedent). Empty (or non-numeric) → composition
  // root wires the NoopBetaSignupNotifier so the route stays 202 and the
  // operator gets a structured warn log to monitor.
  brevoBetaListId: (() => {
    const raw = toOptionalString(process.env.BREVO_BETA_LIST_ID);
    if (!raw) return;
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  })(),
  // R2 W3.4 — Salt for admin CSV export pseudonymization. Config value, NOT a
  // feature flag (cf. AUDIT_CHAIN_ALERT_EMAIL precedent). Empty → composition
  // root falls back to the legacy literal so local dev / boot stays ergonomic.
  // Rotate manually after a breach.
  exportPseudonymSalt: toOptionalString(process.env.EXPORT_PSEUDONYM_SALT),
  storage: {
    driver: storageDriver,
    // Resolved at parse time so downstream consumers always see an absolute path,
    // independent of `process.cwd()` at the call site. Mirrors `LocalImageStorage`'s
    // own default (`<cwd>/tmp/uploads`) so the harness — which constructs
    // `new LocalImageStorage()` without override — stays compatible. Relative
    // env values are resolved against `process.cwd()` for the same reason.
    localUploadsDir: path.resolve(
      process.cwd(),
      toOptionalString(process.env.LOCAL_UPLOADS_DIR) ?? path.join('tmp', 'uploads'),
    ),
    signedUrlTtlSeconds: toNumber(process.env.S3_SIGNED_URL_TTL_SECONDS, 900),
    // SEC-HARDENING (L3): in production, MEDIA_SIGNING_SECRET MUST be set
    // explicitly — no silent fallback to JWT_ACCESS_SECRET / JWT_SECRET.
    // Sharing a single secret across signing domains means a rotation (or
    // leak) of one defeats the other. In non-production, fall back to the
    // JWT secrets / local dev default for developer ergonomics.
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
};

if (env.nodeEnv === 'production') {
  validateProductionEnv(env);
}

export { env };
export type { AppEnv, DeploymentMode, LlmProvider, StorageDriver };
