/** Allowed Node.js runtime environments. */
export type NodeEnv = 'development' | 'test' | 'production';

/** Supported LLM provider identifiers. */
export type LlmProvider = 'openai' | 'deepseek' | 'google';

/** Supported object-storage driver identifiers. */
export type StorageDriver = 'local' | 's3';

/**
 * Advanced guardrail candidate for the V2 POC. `off` = noop adapter (default).
 *
 * F4 (2026-04-30) — `llm-judge` adds a structured-output LLM second-layer verdict
 * AFTER the deterministic keyword guardrail, gated by message length and budget.
 * See `src/modules/chat/useCase/llm-judge-guardrail.ts`.
 */
export type GuardrailsV2Candidate = 'off' | 'llm-guard' | 'nemo' | 'prompt-armor' | 'llm-judge';

/**
 * Deployment topology hint consumed by boot-time invariant checks.
 *
 * - `single`: one process / replica. In-memory rate-limit and LLM cache are safe.
 * - `multi`: horizontally scaled (PM2 cluster, K8s replicas, etc.). Shared Redis
 *   is REQUIRED in production to avoid per-replica rate-limit bypass and
 *   per-replica LLM cache fragmentation.
 */
export type DeploymentMode = 'single' | 'multi';

/** Application configuration loaded from environment variables. */
export interface AppEnv {
  nodeEnv: NodeEnv;
  /** Deployment topology hint for boot-time invariant checks. */
  deploymentMode: DeploymentMode;
  port: number;
  /** Resolved application version (APP_VERSION → npm_package_version → 'unknown'). */
  appVersion: string;
  /** Git commit SHA from CI (COMMIT_SHA or GITHUB_SHA), undefined locally. */
  commitSha?: string;
  /** Frontend base URL for email links (e.g. password reset). */
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
    /** Optional read-replica connection URL. When set, dataSourceRouter.read uses it. */
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
     * AES-256-GCM key (32 raw bytes, supplied base64-encoded) used to encrypt
     * the per-user TOTP shared secret at rest. Distinct from `JWT_*` and
     * `MEDIA_SIGNING_SECRET` per the SEC-HARDENING H12 / L3 secret-separation
     * pattern (`env.production-validation.ts` enforces distinctness in prod).
     *
     * Optional in dev/test (a deterministic dev key is injected); REQUIRED in
     * production.
     */
    mfaEncryptionKey: string;
    /**
     * Short-lived JWT secret used to sign the `mfaSessionToken` issued between
     * the password step and the TOTP challenge. Distinct from access/refresh
     * secrets so a leak of one cannot replay the other. Optional in dev/test;
     * required in production. Defaults to a derived dev value when absent.
     */
    mfaSessionTokenSecret: string;
    /**
     * TTL of the `mfaSessionToken` in seconds. Default 5 minutes — long enough
     * for the user to retrieve a code, short enough that an interception window
     * stays small.
     */
    mfaSessionTokenTtlSeconds: number;
    /**
     * Length of the warning window (in days) granted to existing admins who
     * land on a build that requires MFA but have not yet enrolled. Default 30
     * (user-confirmed). Past the deadline, login is soft-blocked.
     */
    mfaEnrollmentWarningDays: number;
    /**
     * Phase 5 — JWKS endpoint URL for Apple Sign-In token verification.
     * Defaults to Apple's canonical URL in production. Overridable in tests
     * to point at the local `startSocialJwtSpoof()` HTTP server.
     */
    appleJwksUrl: string;
    /**
     * Phase 5 — JWKS endpoint URL for Google Sign-In token verification.
     * Defaults to Google's canonical URL in production. Overridable in tests
     * to point at the local `startSocialJwtSpoof()` HTTP server.
     */
    googleJwksUrl: string;
    /**
     * F3 (2026-04-30) — when `true`, `/social-login` MUST receive a nonce and
     * the verifier MUST find a matching `nonce` claim in the ID token (Google
     * direct, Apple via SHA-256). When `false` (default), missing nonces are
     * accepted so legacy mobile clients keep working through the rollout. Flip
     * to `true` once every supported mobile build ships the nonce flow.
     */
    oidcNonceEnforce: boolean;
    /**
     * F7 (2026-04-30) — HMAC key used to bind a CSRF double-submit token to
     * the active access-token cookie. Distinct from JWT_* / MEDIA_SIGNING_SECRET
     * / MFA_* per the H12 / L3 secret-separation pattern. REQUIRED in
     * production, dev/test fall back to a deterministic local value.
     *
     * The CSRF cookie value = HMAC-SHA256(access_token cookie, csrfSecret).
     * Validation is constant-time (`crypto.timingSafeEqual`).
     */
    csrfSecret: string;
    /**
     * Phase 5 — selects the email service implementation at composition-root
     * init time. `'test'` activates the in-memory `TestEmailService` for e2e
     * tests. `'brevo'` (default) uses `BrevoEmailService` when `brevoApiKey`
     * is set. `'noop'` disables email delivery silently.
     *
     * NEVER set to `'test'` in production — a sentinel in
     * `env.production-validation.ts` rejects it loudly at startup.
     */
    emailServiceKind: 'test' | 'brevo' | 'noop';
    /**
     * F10 — toggle for the HIBP Pwned Passwords k-anonymity check.
     * Default `true` everywhere except e2e tests, where the harness overrides
     * it to `false` to avoid a network round-trip on every register/reset call
     * (and to keep canonical fixture passwords like `Password123!` usable).
     *
     * Production rejects `false` loudly via `env.production-validation.ts` —
     * disabling the breach gate in prod would weaken the registration pipeline.
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
    /** Whether the LLM response cache (G spec) is active. Defaults true; set false to bypass. */
    cacheEnabled: boolean;
  };
  rateLimit: {
    ipLimit: number;
    sessionLimit: number;
    /**
     * Per-authenticated-user message budget within `windowMs`.
     * Complements `sessionLimit`: catches abuse spread across many sessions
     * (a single user could otherwise multiply throughput by spawning sessions).
     * SEC-20 (2026-04-08).
     */
    userLimit: number;
    windowMs: number;
    /**
     * F2 (2026-04-30) — when `true` and the Redis store is configured but
     * unreachable, rate-limit middlewares respond 503 instead of degrading
     * to per-instance in-memory buckets (which silently disable distributed
     * limits in multi-instance deployments). Production default = `true`,
     * dev/test default = `false` so local stacks without Redis still work.
     */
    failClosed: boolean;
  };
  upload: {
    allowedMimeTypes: string[];
    allowedAudioMimeTypes: string[];
  };
  brevoApiKey?: string;
  supportInboxEmail: string;
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
    /** Optional password used to authenticate against Redis (overrides URL-embedded password). */
    password?: string;
    sessionTtlSeconds: number;
    listTtlSeconds: number;
    /** TTL for LLM response cache entries (seconds). Default 7 days. */
    llmTtlSeconds: number;
    /** TTL for popularity ZSET entries (seconds). Default 30 days. */
    llmPopularityTtlSeconds: number;
    /** Maximum entries per museum in low-data pack. Default 30. */
    lowDataPackMaxEntries: number;
  };
  sentry?: {
    dsn: string;
    environment: string;
    release: string;
    tracesSampleRate: number;
    profilesSampleRate: number;
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
  /** Maximum chat messages a free-tier user can send per calendar day. */
  freeTierDailyChatLimit: number;
  /** TTL in seconds for Overpass API museum search cache entries. */
  overpassCacheTtlSeconds: number;
  /**
   * Overpass API (OpenStreetMap) museum-search client configuration.
   *
   * Complements the legacy flat {@link overpassCacheTtlSeconds} with an explicit
   * negative-cache window so empty / null responses can be memoised short-term
   * without poisoning the positive-cache window. Used by
   * `createCachedOverpassClient` in `src/shared/http/overpass.client.ts`.
   */
  overpass: {
    /** Positive-cache TTL for non-empty Overpass responses (seconds). Default 24h. */
    cacheTtlSeconds: number;
    /** Negative-cache TTL for empty/failed Overpass responses (seconds). Default 1h. */
    negativeCacheTtlSeconds: number;
  };
  /**
   * Retention window (in days) for chat sessions before the daily purge cron
   * deletes their messages and flags the session via `purged_at`. Default 180
   * (6 months) aligned with GDPR data-minimization policy.
   */
  chatPurgeRetentionDays: number;
  /**
   * Opt-in weekly S3 orphan-sweep job for chat-images + chat-audios prefixes.
   * Default `false` — flip on after the in-cron media purge ships to clean
   * historical orphans, then leave it on as a long-term safety net.
   */
  s3OrphanSweepEnabled: boolean;
  /** Knowledge base (Wikidata) configuration. */
  knowledgeBase: {
    timeoutMs: number;
    cacheTtlSeconds: number;
    cacheMaxEntries: number;
  };
  /**
   * Nominatim (OpenStreetMap) reverse-geocoding client configuration.
   *
   * Enforces the OSMF Nominatim Usage Policy:
   *   - >= 1 s between outbound requests (global in-process rate limiter)
   *   - Mandatory client-side caching (positive + negative TTLs)
   *   - Valid User-Agent built from `appVersion` + `contactEmail`
   *
   * See `src/shared/http/nominatim.client.ts`.
   */
  nominatim: {
    /** Contact email embedded in the Nominatim User-Agent header. */
    contactEmail: string;
    /** Positive-cache TTL for successful reverse-geocode results (seconds). Default 24h. */
    cacheTtlSeconds: number;
    /** Negative-cache TTL for null/failed reverse-geocode lookups (seconds). Default 1h. */
    negativeCacheTtlSeconds: number;
    /** Minimum interval (ms) between any two outbound Nominatim fetches. Default 1000ms per OSMF policy. */
    minRequestIntervalMs: number;
  };
  /** Image enrichment (Unsplash + Wikidata P18) configuration. */
  imageEnrichment: {
    unsplashAccessKey?: string;
    cacheTtlMs: number;
    cacheMaxEntries: number;
    fetchTimeoutMs: number;
    maxImagesPerResponse: number;
  };
  /**
   * Museum enrichment cache retention policy. Complements the refresh scan
   * (which re-fetches rows older than its own threshold) by hard-deleting rows
   * untouched for longer than `hardDeleteAfterDays`. See
   * `PurgeDeadEnrichmentsUseCase`.
   */
  enrichment: {
    /**
     * Age threshold (in days) past which an enrichment cache row is deleted
     * outright. MUST be >= the refresh window so live rows are never purged.
     * Default 180 (6 months).
     */
    hardDeleteAfterDays: number;
  };
  /** Web search multi-provider configuration. */
  webSearch: {
    tavilyApiKey?: string;
    googleCseApiKey?: string;
    googleCseId?: string;
    braveSearchApiKey?: string;
    searxngInstances: string[];
    timeoutMs: number;
    cacheTtlSeconds: number;
    maxResults: number;
  };
  /** Knowledge extraction pipeline configuration. */
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
   * When false, the BullMQ extraction worker and the knowledge-extraction queue
   * are NOT started. The chat module degrades to db-lookup-only (same fallback
   * as the missing-OpenAI-key path), so no `new Redis(...)` ioredis client is
   * created from the extraction path.
   *
   * Use in test environments without Redis (e.g. e2e harness). Default `true`
   * so production behavior is unchanged when the env var is unset.
   *
   * NOTE: This flag no longer gates the museum-enrichment scheduler — see
   * `museumEnrichmentSchedulerEnabled` for that.
   */
  extractionWorkerEnabled: boolean;
  /**
   * Gates the BullMQ producer that schedules `museum-enrichment` jobs (stale
   * cache refresh + dead-row purge). The matching `MuseumEnrichmentWorker`
   * consumer is defined but not yet instantiated at boot, so leaving the
   * producer on causes Redis job accumulation. Default `false` until a worker
   * is wired.
   */
  museumEnrichmentSchedulerEnabled: boolean;
  /** Redis connection configuration for BullMQ and other Redis-backed services. */
  redis: {
    host: string;
    port: number;
    password?: string;
    /** Comma-separated host:port pairs for Redis Cluster mode. When set, ioredis Cluster client is used. */
    clusterNodes: string | null;
  };
  /**
   * Data-retention prune configuration (ADR-018 / ADR-019 / ADR-020).
   * Controls the three daily housekeeping crons that hard-delete stale rows
   * from support_tickets, reviews, and art_keywords.
   */
  retention: {
    /** Master on/off switch. When false, no cron is registered at boot. Default true. */
    enabled: boolean;
    /** BullMQ cron pattern shared by all three retention jobs. Default '15 3 * * *'. */
    cronPattern: string;
    /** Max rows deleted per chunked DELETE transaction. Default 1000. */
    batchLimit: number;
    /** Days since updatedAt before a closed/resolved support ticket is purged. Default 365. */
    supportTicketsDays: number;
    /** Days since updatedAt before a rejected review is purged. Default 30. */
    reviewsRejectedDays: number;
    /** Days since updatedAt before a pending review is purged. Default 60. */
    reviewsPendingDays: number;
    /** Days since updatedAt before a low-hit art keyword is purged. Default 90. */
    artKeywordsDays: number;
    /** hitCount threshold — art keywords with hitCount <= this are candidates. Default 1. */
    artKeywordsHitThreshold: number;
  };
  /**
   * Advanced guardrail V2 configuration. Controls the optional semantic guardrail
   * layer that runs AFTER the deterministic keyword guardrail (kept as first defense).
   * `candidate: 'off'` (default) installs the noop adapter and is a no-op at runtime.
   */
  guardrails: {
    /** Candidate adapter to activate. Defaults to 'off'. */
    candidate: GuardrailsV2Candidate;
    /** Base URL of the LLM Guard sidecar (e.g. http://llm-guard:8081). Only used when candidate === 'llm-guard'. */
    llmGuardUrl?: string;
    /** Hard request timeout (ms) for advanced guardrail checks. Fail-CLOSED on elapsed. */
    timeoutMs: number;
    /** When true, never block — only log decisions (Phase A "observe" mode). */
    observeOnly: boolean;
    /**
     * F4 (2026-04-30) — daily cost cap (in cents) for the `llm-judge` candidate.
     * Tracked in-memory with a UTC-midnight reset; once exceeded, the judge
     * falls back to the keyword-only decision for the remainder of the day.
     *
     * NOTE: per-process counter — multi-instance prod will have per-instance
     * budget, so cumulative spend across N replicas can be up to N×. Acceptable
     * trade-off for v1; Phase 2 moves the counter to Redis (SET with TTL).
     */
    budgetCentsPerDay: number;
    /**
     * F4 — hard timeout (ms) for an individual LLM judge call. On elapsed, the
     * judge returns null and the caller falls back to the keyword decision.
     * p99 ≤ 500ms target.
     */
    judgeTimeoutMs: number;
    /**
     * F4 — minimum message length (chars) below which the judge is NOT invoked.
     * Short messages are decided by keyword-only signal — keeps the cost <15%
     * of total chat traffic.
     */
    judgeMinMessageLength: number;
  };
}
