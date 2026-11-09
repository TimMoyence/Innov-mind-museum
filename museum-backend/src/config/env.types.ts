export type NodeEnv = 'development' | 'test' | 'production';

export type LlmProvider = 'openai' | 'deepseek' | 'google';

export type StorageDriver = 'local' | 's3';

export type EmbeddingsProvider = 'siglip-onnx' | 'replicate';

export type RerankerProvider = 'null' | 'bge-reranker-v2-m3';

export type DeploymentMode = 'single' | 'multi';

export interface AppEnv {
  nodeEnv: NodeEnv;
  deploymentMode: DeploymentMode;
  port: number;
  appVersion: string;
  commitSha?: string;
  frontendUrl?: string;
  trustProxy: boolean;
  corsOrigins: string[];
  jsonBodyLimit: string;
  requestTimeoutMs: number;
  idempotencyTtlMs: number;
  netFaultInjectionEnabled: boolean;
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
    refreshIdleWindowSeconds: number;
    appleClientId: string;
    googleClientIds: string[];
    appleJwksUrl: string;
    googleJwksUrl: string;
    oidcNonceEnforce: boolean;
    csrfSecret: string;
    emailServiceKind: 'test' | 'brevo' | 'noop';
    googleWebOauth?: {
      clientId?: string;
      clientSecret?: string;
      redirectUri?: string;
    };
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
    costGuard: {
      killSwitch: boolean;
      userDailyCapUsd: number;
    };
  };
  rateLimit: {
    ipLimit: number;
    sessionLimit: number;
    userLimit: number;
    windowMs: number;
    failClosed: boolean;
  };
  upload: {
    allowedMimeTypes: string[];
    allowedAudioMimeTypes: string[];
  };
  brevoApiKey?: string;
  supportInboxEmail: string;
  b2bInboxEmail?: string;
  brevoBetaListId?: number;
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
    password?: string;
    sessionTtlSeconds: number;
    listTtlSeconds: number;
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
  freeTierDailyChatLimit: number;
  freeTierMonthlySessionLimit: number;
  overpassCacheTtlSeconds: number;
  overpass: {
    cacheTtlSeconds: number;
    negativeCacheTtlSeconds: number;
  };
  chatPurgeRetentionDays: number;
  s3OrphanPurgeRetentionDays: number;
  knowledgeBase: {
    timeoutMs: number;
    cacheTtlSeconds: number;
    cacheMaxEntries: number;
    breaker: {
      timeoutMs: number;
      errorThresholdPercentage: number;
      resetTimeoutMs: number;
      volumeThreshold: number;
      capacity: number;
    };
    localDumpFallbackAfterMs: number;
  };
  wikidata: {
    userAgent: string;
  };
  knowledgeRouter: {
    threshold: number;
    kbTimeoutMs: number;
    judgeTimeoutMs: number;
    wsTimeoutMs: number;
  };
  nominatim: {
    contactEmail: string;
    cacheTtlSeconds: number;
    negativeCacheTtlSeconds: number;
    minRequestIntervalMs: number;
  };
  imageEnrichment: {
    unsplashAccessKey?: string;
    cacheTtlMs: number;
    cacheMaxEntries: number;
    fetchTimeoutMs: number;
    maxImagesPerResponse: number;
  };
  visualSimilarity: {
    provider: EmbeddingsProvider;
    siglipOnnxModelPath: string;
    replicateApiToken?: string;
    embeddingsDim: number;
    topN: number;
    topKDefault: number;
    wVisual: number;
    wMeta: number;
    fallbackVisualThreshold: number;
    embeddingsCacheTtlMs: number;
    encodeTimeoutMs: number;
  };
  rerank: {
    provider: RerankerProvider;
    modelPath: string;
    timeoutMs: number;
    topKCandidates: number;
    topNFinal: number;
  };
  enrichment: {
    hardDeleteAfterDays: number;
  };
  webSearch: {
    tavilyApiKey?: string;
    braveSearchApiKey?: string;
    googleCseApiKey?: string;
    googleCseId?: string;
    searxngInstances?: string[];
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
  extractionWorkerEnabled: boolean;
  museumEnrichmentSchedulerEnabled: boolean;
  redis: {
    host: string;
    port: number;
    password?: string;
  };
  retention: {
    cronPattern: string;
    batchLimit: number;
    supportTicketsDays: number;
    reviewsRejectedDays: number;
    reviewsPendingDays: number;
    artKeywordsDays: number;
    artKeywordsHitThreshold: number;
  };
  review: {
    npsScaleEpoch: string;
  };
  leads: {
    redeliveryCronPattern: string;
    maxAttempts: number;
    redeliveryBatchLimit: number;
    retentionDays: number;
    backoffBaseMs: number;
    backoffCapMs: number;
  };
  guardrails: {
    budgetCentsPerDay: number;
    judgeTimeoutMs: number;
    judgeMinMessageLength: number;
    budgetBackend: 'memory' | 'redis';
    frictionSessionThreshold: number;
    frictionUserThreshold: number;
    frictionSessionTtlMs: number;
    frictionUserTtlMs: number;
    frictionCooldownMs: number;
    frictionWeightSecurity: number;
    frictionWeightOfftopic: number;
    costCircuitBreaker: {
      hourlyThresholdCents: number;
      dailyBudgetCents: number;
      openDurationMs: number;
    };
  };
  plausible?: {
    domain?: string;
    endpointUrl?: string;
  };
}
