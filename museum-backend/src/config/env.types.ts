/** Allowed Node.js runtime environments. */
export type NodeEnv = 'development' | 'test' | 'production';

/** Supported LLM provider identifiers. */
export type LlmProvider = 'openai' | 'deepseek' | 'google';

/** Supported object-storage driver identifiers. */
export type StorageDriver = 'local' | 's3';

/** Application configuration loaded from environment variables. */
export interface AppEnv {
  nodeEnv: NodeEnv;
  port: number;
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
  tts?: {
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
    voiceMode: boolean;
    ocrGuard: boolean;
    apiKeys: boolean;
    streaming: boolean;
    multiTenancy: boolean;
    userMemory: boolean;
    knowledgeBase: boolean;
    imageEnrichment: boolean;
    webSearch: boolean;
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
}
