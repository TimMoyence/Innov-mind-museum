export type NodeEnv = 'development' | 'test' | 'production';

export type LlmProvider = 'openai' | 'deepseek' | 'google';

export type StorageDriver = 'local' | 's3';

/**
 * C3 (2026-05) — image-embedding providers for `/chat/compare`.
 * `'siglip-onnx'` self-hosts SigLIP base ONNX on CPU (no per-call cost,
 * ~0.6–1.5s/encode, ~500MB RAM); `'replicate'` is the managed fallback (ADR-037).
 */
export type EmbeddingsProvider = 'siglip-onnx' | 'replicate';

// Legacy `GuardrailsV2Candidate` enum retired 2026-05-14 (ADR-015 amendment).
// Each V2 layer now self-activates from its own config presence
// (`GUARDRAILS_V2_LLM_GUARD_URL` for sidecar, `LLM_GUARDRAIL_BUDGET_CENTS_PER_DAY > 0` for judge).

/**
 * Deployment topology hint consumed by boot-time invariant checks.
 * - `single`: one process / replica. In-memory rate-limit and LLM cache are safe.
 * - `multi`: horizontally scaled. Shared Redis REQUIRED in production to avoid
 *   per-replica rate-limit bypass and per-replica LLM cache fragmentation.
 */
export type DeploymentMode = 'single' | 'multi';

export interface AppEnv {
  nodeEnv: NodeEnv;
  deploymentMode: DeploymentMode;
  port: number;
  /** Resolved from APP_VERSION → npm_package_version → 'unknown'. */
  appVersion: string;
  /** From COMMIT_SHA or GITHUB_SHA, undefined locally. */
  commitSha?: string;
  frontendUrl?: string;
  trustProxy: boolean;
  corsOrigins: string[];
  jsonBodyLimit: string;
  requestTimeoutMs: number;
  dbSynchronize: boolean;
  dbSsl: boolean;
  dbSslRejectUnauthorized: boolean;
  db: {
    host: string;
    port: number;
    user?: string;
    password?: string;
    database: string;
    poolMax: number;
    /** Optional read-replica URL. When set, dataSourceRouter.read uses it. */
    replicaUrl: string | null;
  };
  auth: {
    jwtSecret: string;
    accessTokenSecret: string;
    refreshTokenSecret: string;
    accessTokenTtl: string;
    refreshTokenTtl: string;
    /**
     * Sliding window in seconds. If a refresh token has not been rotated for
     * longer than this, the next refresh is rejected and the family revoked,
     * forcing re-authentication. Default: 14 days.
     */
    refreshIdleWindowSeconds: number;
    appleClientId: string;
    googleClientIds: string[];
    /**
     * AES-256-GCM key (32 raw bytes, base64-encoded) used to encrypt the
     * per-user TOTP shared secret at rest. SEC-HARDENING H12 / L3
     * secret-separation: distinct from `JWT_*` and `MEDIA_SIGNING_SECRET`
     * (`env.production-validation.ts` enforces in prod).
     * Optional in dev/test (dev key injected); REQUIRED in production.
     */
    mfaEncryptionKey: string;
    /**
     * Short-lived JWT secret used to sign the `mfaSessionToken` issued between
     * the password step and the TOTP challenge. Distinct from access/refresh
     * secrets so a leak of one cannot replay the other. Required in production.
     */
    mfaSessionTokenSecret: string;
    /** TTL of `mfaSessionToken` in seconds. Default 5 minutes. */
    mfaSessionTokenTtlSeconds: number;
    /**
     * Warning-window length (days) granted to existing admins on a build that
     * requires MFA but haven't enrolled. Default 30. Past deadline, login is
     * soft-blocked.
     */
    mfaEnrollmentWarningDays: number;
    /**
     * Phase 5 — Apple Sign-In JWKS endpoint. Defaults to Apple canonical URL.
     * Overridable in tests for `startSocialJwtSpoof()`.
     */
    appleJwksUrl: string;
    /**
     * Phase 5 — Google Sign-In JWKS endpoint. Defaults to Google canonical URL.
     * Overridable in tests for `startSocialJwtSpoof()`.
     */
    googleJwksUrl: string;
    /**
     * F3 (2026-04-30) — when `true`, `/social-login` MUST receive a nonce and
     * the verifier MUST find a matching `nonce` claim (Google direct, Apple
     * via SHA-256). When `false` (default), missing nonces accepted for legacy
     * clients. Flip to `true` once every supported mobile build ships nonce flow.
     */
    oidcNonceEnforce: boolean;
    /**
     * F7 (2026-04-30) — HMAC key binding a CSRF double-submit token to the
     * active access-token cookie. H12 / L3 secret-separation (distinct from
     * `JWT_*`, `MEDIA_SIGNING_SECRET`, `MFA_*`). REQUIRED in production.
     * CSRF cookie value = HMAC-SHA256(access_token cookie, csrfSecret).
     * Validation is constant-time (`crypto.timingSafeEqual`).
     */
    csrfSecret: string;
    /**
     * Phase 5 — email service implementation at composition-root init.
     * `'test'` activates in-memory `TestEmailService` for e2e tests.
     * `'brevo'` (default) uses `BrevoEmailService` when `brevoApiKey` is set.
     * `'noop'` disables email delivery silently.
     * NEVER set to `'test'` in production — `env.production-validation.ts` rejects it.
     */
    emailServiceKind: 'test' | 'brevo' | 'noop';
    /**
     * F11 (2026-05) — Server-driven Google OAuth flow for museum-web admin.
     * All four fields REQUIRED together to activate /api/auth/google/initiate
     * + /callback; when any missing the routes return 503
     * GOOGLE_OAUTH_NOT_CONFIGURED. Mobile path (POST /social-login with
     * idToken) unaffected.
     */
    googleWebOauth?: {
      /** Web OAuth Client ID (distinct from mobile audiences in `googleClientIds`). */
      clientId?: string;
      clientSecret?: string;
      redirectUri?: string;
    };
    /**
     * F10 — HIBP Pwned Passwords k-anonymity check.
     * Default `true` everywhere except e2e (harness overrides false to avoid
     * network and keep fixtures like `Password123!` usable).
     * Production rejects `false` via `env.production-validation.ts`.
     */
    passwordBreachCheckEnabled: boolean;
  };
  llm: {
    provider: LlmProvider;
    model: string;
    audioTranscriptionModel: string;
    temperature: number;
    timeoutMs: number;
    timeoutSummaryMs: number;
    totalBudgetMs: number;
    retries: number;
    retryBaseDelayMs: number;
    maxConcurrent: number;
    maxHistoryMessages: number;
    maxTextLength: number;
    maxImageBytes: number;
    maxAudioBytes: number;
    maxOutputTokens: number;
    includeDiagnostics: boolean;
    openAiApiKey?: string;
    deepseekApiKey?: string;
    googleApiKey?: string;
    /**
     * P0-4 (audit 2026-05-12 §P0-U-2) cost guard. NOT feature flags —
     * `killSwitch` is an operational panic button (env reload + restart),
     * `userDailyCapUsd` is per-user daily USD ceiling. Wired through
     * `LlmCostGuard` at the HTTP route seam.
     */
    costGuard: {
      /** When `true`, every paid LLM call is denied. */
      killSwitch: boolean;
      /** Per-authenticated-user daily USD ceiling (anonymous bypasses). */
      userDailyCapUsd: number;
    };
  };
  rateLimit: {
    ipLimit: number;
    sessionLimit: number;
    /**
     * Per-authenticated-user message budget within `windowMs`. Complements
     * `sessionLimit`: catches abuse spread across many sessions (a user could
     * otherwise multiply throughput by spawning sessions). SEC-20 (2026-04-08).
     */
    userLimit: number;
    windowMs: number;
    /**
     * F2 (2026-04-30) — when `true` and Redis store unreachable, rate-limit
     * middlewares respond 503 instead of degrading to per-instance in-memory
     * buckets (which silently disable distributed limits in multi-instance).
     * Production default = `true`, dev/test default = `false`.
     */
    failClosed: boolean;
  };
  upload: {
    allowedMimeTypes: string[];
    allowedAudioMimeTypes: string[];
  };
  brevoApiKey?: string;
  supportInboxEmail: string;
  /**
   * R4 W4.3 — B2B leads inbox. Config value (NOT a feature flag).
   * When unset, leads route to `supportInboxEmail` to avoid env churn in dev.
   */
  b2bInboxEmail?: string;
  /**
   * R3 W4.2 — Brevo contact-list ID for the public beta waitlist. Config
   * value (NOT a feature flag). When unset, composition root falls back to
   * `NoopBetaSignupNotifier`; route still returns 202 with warning log.
   */
  brevoBetaListId?: number;
  /**
   * R2 W3.4 — Salt for `admin/export` pseudonymization of emails/user-IDs in
   * CSV downloads. Rotate manually after breach (rotation invalidates link
   * between pseudonym and identity in already-exported CSVs). Config value,
   * NOT a feature flag. Fallback `'musaium-admin-export-v1'` for dev.
   */
  exportPseudonymSalt?: string;
  storage: {
    driver: StorageDriver;
    localUploadsDir: string;
    signedUrlTtlSeconds: number;
    signingSecret: string;
    s3?: {
      endpoint?: string;
      region?: string;
      bucket?: string;
      accessKeyId?: string;
      secretAccessKey?: string;
      sessionToken?: string;
      publicBaseUrl?: string;
      objectKeyPrefix?: string;
    };
  };
  tts: {
    model: string;
    voice: string;
    speed: number;
    maxTextLength: number;
    cacheTtlSeconds: number;
  };
  cache?: {
    enabled: boolean;
    url: string;
    /** Overrides URL-embedded password. */
    password?: string;
    sessionTtlSeconds: number;
    listTtlSeconds: number;
    /** Max entries per museum in low-data pack. Default 30. */
    lowDataPackMaxEntries: number;
  };
  sentry?: {
    dsn: string;
    environment: string;
    release: string;
    tracesSampleRate: number;
    profileSessionSampleRate: number;
  };
  otel?: {
    enabled: boolean;
    exporterEndpoint: string;
    serviceName: string;
  };
  /** Langfuse LLM observability (V12 W1 — disabled by default). */
  langfuse?: {
    enabled: boolean;
    publicKey: string | undefined;
    secretKey: string | undefined;
    host: string;
  };
  /** Max chat messages a free-tier user can send per calendar day. */
  freeTierDailyChatLimit: number;
  /**
   * Max chat sessions a `tier='free'` user can CREATE per UTC month. Drives
   * the soft-paywall middleware (R1 / C6). Config value, NOT a feature flag —
   * disabling the paywall = revert R1, never set this to a very high number
   * (per `feedback_no_feature_flags_prelaunch`). Falls back to 3 when unset.
   */
  freeTierMonthlySessionLimit: number;
  /** TTL in seconds for Overpass API museum search cache entries. */
  overpassCacheTtlSeconds: number;
  /**
   * Overpass API client. Complements legacy {@link overpassCacheTtlSeconds}
   * with explicit negative-cache window so empty/null responses can be
   * memoised short-term without poisoning the positive-cache window.
   */
  overpass: {
    /** Positive-cache TTL for non-empty responses (seconds). Default 24h. */
    cacheTtlSeconds: number;
    /** Negative-cache TTL for empty/failed responses (seconds). Default 1h. */
    negativeCacheTtlSeconds: number;
  };
  /**
   * Retention window (days) for chat sessions before daily purge cron deletes
   * messages and flags via `purged_at`. Default 180 (6 months) — GDPR
   * data-minimization.
   */
  chatPurgeRetentionDays: number;
  /** Knowledge base (Wikidata) configuration. */
  knowledgeBase: {
    timeoutMs: number;
    cacheTtlSeconds: number;
    cacheMaxEntries: number;
    /**
     * Circuit-breaker tuning around Wikidata SPARQL/API client (C5.1).
     * No `enabled` flag — rollback is `git revert` (pre-launch V1 doctrine).
     */
    breaker: {
      timeoutMs: number;
      errorThresholdPercentage: number;
      resetTimeoutMs: number;
      volumeThreshold: number;
      capacity: number;
    };
    /**
     * Soak window (ms) the breaker must stay OPEN before cascade consults the
     * local Wikidata dump (Step 5.1). `0` = consult immediately on OPEN.
     */
    localDumpFallbackAfterMs: number;
  };
  /** Wikidata HTTP client tuning (User-Agent per WMF policy). */
  wikidata: {
    userAgent: string;
  };
  /**
   * C4.1 (2026-05-11) — KnowledgeRouter cascade tuning. TUNING-ONLY — no
   * `*_ENABLED` switch may be added (pre-launch V1 doctrine, ADR-039).
   */
  knowledgeRouter: {
    /** Confidence cutoff in [0..1] above which WebSearch is skipped (default 0.7). */
    threshold: number;
    /** KB lookup per-leg budget in ms (default 200). */
    kbTimeoutMs: number;
    /** LLM judge per-leg budget in ms (default 500). */
    judgeTimeoutMs: number;
    /** WebSearch per-leg budget in ms (default 1500). */
    wsTimeoutMs: number;
  };
  /**
   * Nominatim (OSM) reverse-geocoding client. Enforces OSMF Nominatim Usage
   * Policy: >= 1s between outbound requests, mandatory client-side caching,
   * valid User-Agent built from `appVersion` + `contactEmail`.
   */
  nominatim: {
    /** Contact email embedded in Nominatim User-Agent. */
    contactEmail: string;
    /** Positive-cache TTL for successful results (seconds). Default 24h. */
    cacheTtlSeconds: number;
    /** Negative-cache TTL for null/failed lookups (seconds). Default 1h. */
    negativeCacheTtlSeconds: number;
    /** Min interval (ms) between any two outbound fetches. Default 1000ms per OSMF policy. */
    minRequestIntervalMs: number;
  };
  /** Image enrichment (Unsplash + Wikidata P18 + v2 sources). */
  imageEnrichment: {
    unsplashAccessKey?: string;
    cacheTtlMs: number;
    cacheMaxEntries: number;
    fetchTimeoutMs: number;
    maxImagesPerResponse: number;
  };
  /**
   * C3 (2026-05) — visual similarity engine (`/chat/compare`, ADR-037).
   * Pipeline: encodes upload to fixed-dim embedding (default SigLIP base
   * patch16-224 → 768d), searches `artwork_embeddings` via pgvector HNSW for
   * top-N=20, enriches metadata via Wikidata, then fuses weighted
   * (`wVisual` × visualScore + `wMeta` × metadataScore) final score before
   * truncating to top-K.
   */
  visualSimilarity: {
    /**
     * `'siglip-onnx'` (default) = self-host CPU; `'replicate'` = managed
     * fallback. Both implement `EmbeddingsPort` (provider-agnostic use case).
     */
    provider: EmbeddingsProvider;
    /**
     * Path to SigLIP ONNX bundle. Relative paths resolve from `process.cwd()`.
     * Default `./models/siglip-base-patch16-224.onnx` (downloaded at Docker
     * build by `scripts/fetch-models.sh`). Ignored when `provider === 'replicate'`.
     */
    siglipOnnxModelPath: string;
    /** Only consumed when `provider === 'replicate'`. */
    replicateApiToken?: string;
    /**
     * Embedding dimension. Default 768 matches SigLIP-base. Changing REQUIRES
     * re-ingesting `artwork_embeddings` and a new migration to widen
     * `halfvec(N)` column — do not flip casually.
     */
    embeddingsDim: number;
    /** ANN top-N candidates fetched from pgvector before re-ranking. Default 20. */
    topN: number;
    /** Default top-K returned after fusion. Capped server-side. Default 5. */
    topKDefault: number;
    /** Fusion weight applied to visual cosine score. Defaults sum to 1 (0.7 + 0.3). */
    wVisual: number;
    /** Fusion weight applied to metadata score (license + freshness). Default 0.3. */
    wMeta: number;
    /**
     * Visual score threshold below which result is degraded to
     * `no_visual_neighbor` fallback (no compare results, generic prompt).
     * Default 0.4. Raise for precision, lower for recall.
     */
    fallbackVisualThreshold: number;
    /**
     * TTL (ms) for in-memory + Redis embedding cache (queries dedup'd by
     * SHA256 of input bytes). Default 1h. Raise for stable catalogs.
     */
    embeddingsCacheTtlMs: number;
    /**
     * Hard timeout (ms) on a single encoder call. On elapsed, use case surfaces
     * `EncoderUnavailableError` and route returns `encoder_unavailable`
     * fallback. Default 3000ms (covers SigLIP-base CPU p99 with margin).
     */
    encodeTimeoutMs: number;
  };
  /**
   * Museum enrichment cache retention. Complements refresh scan (which
   * re-fetches rows older than its own threshold) by hard-deleting rows
   * untouched longer than `hardDeleteAfterDays`. See `PurgeDeadEnrichmentsUseCase`.
   */
  enrichment: {
    /**
     * Age threshold (days) past which an enrichment cache row is deleted.
     * MUST be >= refresh window so live rows are never purged. Default 180.
     */
    hardDeleteAfterDays: number;
  };
  webSearch: {
    tavilyApiKey?: string;
    braveSearchApiKey?: string;
    timeoutMs: number;
    cacheTtlSeconds: number;
    maxResults: number;
  };
  extraction: {
    queueConcurrency: number;
    queueRateLimit: number;
    scrapeTimeoutMs: number;
    contentMaxBytes: number;
    refetchAfterDays: number;
    llmModel: string;
    confidenceThreshold: number;
    reviewThreshold: number;
  };
  /**
   * When false, BullMQ extraction worker and knowledge-extraction queue NOT
   * started. Chat module degrades to db-lookup-only (same fallback as missing
   * OpenAI key path), so no `new Redis(...)` ioredis client is created from
   * extraction path. Use in test environments without Redis (e.g. e2e harness).
   * Default `true`. Does NOT gate museum-enrichment scheduler — see
   * `museumEnrichmentSchedulerEnabled`.
   */
  extractionWorkerEnabled: boolean;
  /**
   * Gates BullMQ producer that schedules `museum-enrichment` jobs (stale-cache
   * refresh + dead-row purge). Matching `MuseumEnrichmentWorker` consumer is
   * defined but not instantiated at boot, so leaving producer on causes Redis
   * job accumulation. Default `false` until worker is wired.
   */
  museumEnrichmentSchedulerEnabled: boolean;
  redis: {
    host: string;
    port: number;
    password?: string;
    /** Comma-separated host:port pairs for Redis Cluster mode (ioredis Cluster client). */
    clusterNodes: string | null;
  };
  /**
   * Data-retention prune (ADR-018/019/020). Controls three daily housekeeping
   * crons that hard-delete stale rows from support_tickets, reviews, art_keywords.
   */
  retention: {
    /** BullMQ cron pattern shared by all three retention jobs. Default '15 3 * * *'. */
    cronPattern: string;
    /** Max rows deleted per chunked DELETE transaction. Default 1000. */
    batchLimit: number;
    /** Days since updatedAt before closed/resolved support ticket purged. Default 365. */
    supportTicketsDays: number;
    /** Days since updatedAt before rejected review purged. Default 30. */
    reviewsRejectedDays: number;
    /** Days since updatedAt before pending review purged. Default 60. */
    reviewsPendingDays: number;
    /** Days since updatedAt before low-hit art keyword purged. Default 90. */
    artKeywordsDays: number;
    /** hitCount <= this is candidate. Default 1. */
    artKeywordsHitThreshold: number;
  };
  /**
   * Advanced guardrail V2. Each layer below self-activates from its own
   * config presence (URL for sidecar, budget>0 for judge) — no master
   * "candidate" flag (ADR-015 amendment 2026-05-14, T1.7#2).
   */
  guardrails: {
    /** Base URL of LLM Guard sidecar. When set, LLMGuardAdapter is wired. */
    llmGuardUrl?: string;
    /** Hard request timeout (ms). Fail-CLOSED on elapsed. */
    timeoutMs: number;
    /** When true, never block — only log decisions (Phase A "observe" mode). */
    observeOnly: boolean;
    /**
     * F4 (2026-04-30) — daily cost cap (cents) for structured-output judge.
     * Default `500` ($5/day) activates judge in parallel with sidecar
     * (defense-in-depth, ADR-015 amendment). Budget gate disables layer when
     * `cap <= 0`. Tracked via configured backend (memory per-process or Redis
     * shared-across-replicas).
     */
    budgetCentsPerDay: number;
    /**
     * F4 — hard timeout (ms) per LLM judge call. On elapsed, judge returns null
     * and caller falls back to keyword decision. p99 ≤ 500ms target.
     */
    judgeTimeoutMs: number;
    /**
     * F4 — min message length (chars) below which judge is NOT invoked. Short
     * messages decided by keyword-only signal — keeps cost <15% of chat traffic.
     */
    judgeMinMessageLength: number;
    /**
     * ADR-030 (2026-05-05) — backend store for cumulative judge budget counter.
     * 'memory' = per-process (legacy F4); 'redis' = shared via SET INCRBY + TTL.
     */
    budgetBackend: 'memory' | 'redis';
    /**
     * 2026-05-12 — LLM Guard sidecar circuit breaker
     * (`adapters/secondary/guardrails/guardrail-circuit-breaker.ts`).
     * NOT a feature flag — always-on (pre-launch V1 doctrine).
     */
    circuitBreaker: {
      /** Failures within `windowMs` that trip breaker OPEN. */
      failureThreshold: number;
      /** Sliding-window length (ms) for failure count. */
      windowMs: number;
      /** Cooldown (ms) after which OPEN becomes HALF_OPEN. */
      openDurationMs: number;
      /** Max concurrent probes admitted while HALF_OPEN. */
      halfOpenMaxProbes: number;
    };
    /**
     * 2026-05-12 (ADR-047) — concurrent /scan call cap per backend process.
     * Prevents surge amplifying sidecar latency into death spiral.
     * Overflow → fail-CLOSED (safety preserved).
     */
    maxInflight: number;
    /** Surge queue depth before overflow → fail-CLOSED. */
    queueMax: number;
    /**
     * ADR-051 (2026-05-13) — Microsoft Presidio analyzer+anonymizer sidecar.
     * Adapter implemented but NOT wired pre-launch; knobs await Phase 1
     * shadow promotion.
     */
    presidio: {
      baseUrl?: string;
      /** Hard request timeout (ms) for /analyze + /anonymize. Fail-CLOSED on elapsed. */
      timeoutMs: number;
    };
    /**
     * ADR-051 (2026-05-13) — Llama Prompt Guard 2 86M (Meta) sidecar.
     * Same not-wired-yet status as Presidio. Score threshold is MALICIOUS
     * probability above which adapter returns block verdict.
     */
    llamaPromptGuard: {
      baseUrl?: string;
      /** Hard request timeout (ms) for /classify. Fail-CLOSED on elapsed. */
      timeoutMs: number;
      /** MALICIOUS score threshold above which block verdict emitted. Default 0.8. */
      scoreThreshold: number;
    };
    /**
     * Chaos drill probability in [0, 1] consumed by `LLMGuardAdapter`. Each
     * scan samples uniform random; if < `chaosRate`, call aborted BEFORE fetch
     * (exercise of fail-CLOSED path). Production MUST be 0.
     */
    chaosRate: number;
    /**
     * 2026-05-13 — LLM cost circuit breaker (perennial design §11 D9 RE2).
     * Distinct from latency `LLMCircuitBreaker`: trips on cost SPIKES (DDoS /
     * scraping abuse) and daily-cap breach. ALWAYS-ON (pre-launch V1 doctrine).
     */
    costCircuitBreaker: {
      /** Cents-per-hour threshold above which breaker trips OPEN. */
      hourlyThresholdCents: number;
      /** Cents-per-UTC-day cumulative cap above which breaker trips OPEN. */
      dailyBudgetCents: number;
      /** Cooldown (ms) after which OPEN becomes HALF_OPEN. */
      openDurationMs: number;
    };
    /**
     * 2026-05-13 — per-tenant rate limiter (perennial design §11 D10 RE3).
     * Primitive only — NOT wired V1 (single B2C tenant). Mounted Phase 2 (B2B
     * onset). Token-bucket: bursts up to `capacity`, refill at `refillPerSecond`.
     */
    tenantRateLimit: {
      /** Max tokens per bucket (burst capacity). */
      capacity: number;
      /** Tokens regenerated per second. 1.0 = one sustained req/s. */
      refillPerSecond: number;
    };
  };
}
