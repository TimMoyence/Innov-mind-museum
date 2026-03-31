import dotenv from 'dotenv';

dotenv.config();

/** Allowed Node.js runtime environments. */
type NodeEnv = 'development' | 'test' | 'production';
/** Supported LLM provider identifiers. */
type LlmProvider = 'openai' | 'deepseek' | 'google';
/** Supported object-storage driver identifiers. */
type StorageDriver = 'local' | 's3';

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

/** Application configuration loaded from environment variables. */
interface AppEnv {
  nodeEnv: NodeEnv;
  port: number;
  trustProxy: boolean;
  corsOrigins: string[];
  jsonBodyLimit: string;
  requestTimeoutMs: number;
  dbSynchronize: boolean;
  dbSsl: boolean;
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
    windowMs: number;
  };
  upload: {
    allowedMimeTypes: string[];
    allowedAudioMimeTypes: string[];
  };
  brevoApiKey?: string;
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
}

const required = (name: string, value: string | undefined): string => {
  if (!value?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

const nodeEnvRaw = (process.env.NODE_ENV || 'development') as NodeEnv;
if (!['development', 'test', 'production'].includes(nodeEnvRaw)) {
  throw new Error(`Invalid NODE_ENV="${nodeEnvRaw}". Must be development, test, or production.`);
}
const nodeEnv: NodeEnv = nodeEnvRaw;

const providerRaw = (process.env.LLM_PROVIDER || 'openai').toLowerCase();
const provider: LlmProvider = ['openai', 'deepseek', 'google'].includes(providerRaw)
  ? (providerRaw as LlmProvider)
  : 'openai';

const storageDriverRaw = (process.env.OBJECT_STORAGE_DRIVER || 'local').toLowerCase();
const storageDriver: StorageDriver = ['local', 's3'].includes(storageDriverRaw)
  ? (storageDriverRaw as StorageDriver)
  : 'local';

const isDev = nodeEnv === 'development' || nodeEnv === 'test';

/** Resolved application configuration singleton, validated at startup. */
const env: AppEnv = {
  nodeEnv,
  port: toNumber(process.env.PORT, 3000),
  trustProxy: toBoolean(process.env.TRUST_PROXY, true),
  corsOrigins: toList(process.env.CORS_ORIGINS),
  jsonBodyLimit: process.env.JSON_BODY_LIMIT || '1mb',
  requestTimeoutMs: toNumber(process.env.REQUEST_TIMEOUT_MS, 20000),
  dbSynchronize: toBoolean(process.env.DB_SYNCHRONIZE, false),
  dbSsl: toBoolean(process.env.DB_SSL, true),
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
    refreshTokenTtl: process.env.JWT_REFRESH_TTL || '30d',
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
        sessionTtlSeconds: toNumber(process.env.CACHE_SESSION_TTL_SECONDS, 3600),
        listTtlSeconds: toNumber(process.env.CACHE_LIST_TTL_SECONDS, 300),
      }
    : undefined,
  sentry: toOptionalString(process.env.SENTRY_DSN)
    ? {
        dsn: (process.env.SENTRY_DSN ?? '').trim(),
        environment: nodeEnv,
        release:
          toOptionalString(process.env.APP_VERSION) || process.env.npm_package_version || '1.0.0',
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
  brevoApiKey: toOptionalString(process.env.BREVO_API_KEY),
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
  if (!env.brevoApiKey) {
    console.warn('BREVO_API_KEY not set \u2014 password reset emails will not be sent');
  }
  required(
    'JWT_ACCESS_SECRET or JWT_SECRET',
    process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET,
  );
  required('JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET);
  required('PGDATABASE', process.env.PGDATABASE);
  required('CORS_ORIGINS', process.env.CORS_ORIGINS);
  required('MEDIA_SIGNING_SECRET', process.env.MEDIA_SIGNING_SECRET);

  if (env.llm.provider === 'openai') {
    required('OPENAI_API_KEY', env.llm.openAiApiKey);
  }
  if (env.llm.provider === 'deepseek') {
    required('DEEPSEEK_API_KEY', env.llm.deepseekApiKey);
  }
  if (env.llm.provider === 'google') {
    required('GOOGLE_API_KEY', env.llm.googleApiKey);
  }

  if (env.storage.driver === 's3') {
    required('S3_ENDPOINT', env.storage.s3?.endpoint);
    required('S3_REGION', env.storage.s3?.region);
    required('S3_BUCKET', env.storage.s3?.bucket);
    required('S3_ACCESS_KEY_ID', env.storage.s3?.accessKeyId);
    required('S3_SECRET_ACCESS_KEY', env.storage.s3?.secretAccessKey);
  }
}

export { env };
export type { AppEnv, LlmProvider, StorageDriver };
