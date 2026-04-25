/** Allowed Node.js runtime environments. */
export type NodeEnv = 'development' | 'test' | 'production';

/** Supported LLM provider identifiers. */
export type LlmProvider = 'openai' | 'deepseek' | 'google';

/** Supported object-storage driver identifiers. */
export type StorageDriver = 'local' | 's3';

/** Advanced guardrail candidate for the V2 POC. `off` = noop adapter (default). */
export type GuardrailsV2Candidate = 'off' | 'llm-guard' | 'nemo' | 'prompt-armor';

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
   * When false, the BullMQ extraction worker, the knowledge-extraction queue,
   * and the museum enrichment scheduler are NOT started. The chat module
   * degrades to db-lookup-only (same fallback as the missing-OpenAI-key path),
   * so no `new Redis(...)` ioredis client is created from the extraction path.
   *
   * Use in test environments without Redis (e.g. e2e harness). Default `true`
   * so production behavior is unchanged when the env var is unset.
   */
  extractionWorkerEnabled: boolean;
  /** Redis connection configuration for BullMQ and other Redis-backed services. */
  redis: {
    host: string;
    port: number;
    password?: string;
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
  };
}
