/** Allowed Node.js runtime environments. */
export type NodeEnv = 'development' | 'test' | 'production';

/** Supported LLM provider identifiers. */
export type LlmProvider = 'openai' | 'deepseek' | 'google';

/** Supported object-storage driver identifiers. */
export type StorageDriver = 'local' | 's3';

/** Advanced guardrail candidate for the V2 POC. `off` = noop adapter (default). */
export type GuardrailsV2Candidate = 'off' | 'llm-guard' | 'nemo' | 'prompt-armor';

/** Application configuration loaded from environment variables. */
export interface AppEnv {
  nodeEnv: NodeEnv;
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
    enabled: boolean;
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
  featureFlags: {
    ocrGuard: boolean;
    apiKeys: boolean;
    multiTenancy: boolean;
    userMemory: boolean;
    knowledgeBase: boolean;
    imageEnrichment: boolean;
    webSearch: boolean;
    knowledgeExtraction: boolean;
    /**
     * When true, inject the output-side ArtTopicClassifier (LLM-based) that rejects
     * responses unrelated to art/museums. Default false — discipline topique déléguée
     * au system prompt LLM pour permettre digressions culturelles légitimes.
     */
    artTopicClassifier: boolean;
  };
  /** Maximum chat messages a free-tier user can send per calendar day. */
  freeTierDailyChatLimit: number;
  /** TTL in seconds for Overpass API museum search cache entries. */
  overpassCacheTtlSeconds: number;
  /** Knowledge base (Wikidata) configuration. */
  knowledgeBase: {
    timeoutMs: number;
    cacheTtlSeconds: number;
    cacheMaxEntries: number;
  };
  /** Image enrichment (Unsplash + Wikidata P18) configuration. */
  imageEnrichment: {
    unsplashAccessKey?: string;
    cacheTtlMs: number;
    cacheMaxEntries: number;
    fetchTimeoutMs: number;
    maxImagesPerResponse: number;
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
