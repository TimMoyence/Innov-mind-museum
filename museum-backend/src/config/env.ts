import dotenv from 'dotenv';

dotenv.config();

type NodeEnv = 'development' | 'test' | 'production';
type LlmProvider = 'openai' | 'deepseek' | 'google';

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

const toCookieDomain = (value: string | undefined): string | undefined => {
  if (!value || !value.trim()) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'localhost') {
    return undefined;
  }

  return value.trim();
};

interface AppEnv {
  nodeEnv: NodeEnv;
  port: number;
  trustProxy: boolean;
  corsOrigins: string[];
  cookieDomain?: string;
  jsonBodyLimit: string;
  requestTimeoutMs: number;
  dbSynchronize: boolean;
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
    sessionSecret: string;
  };
  llm: {
    provider: LlmProvider;
    model: string;
    temperature: number;
    parallelEnabled: boolean;
    timeoutMs: number;
    timeoutSummaryMs: number;
    timeoutExpertCompactMs: number;
    totalBudgetMs: number;
    retries: number;
    retryBaseDelayMs: number;
    maxConcurrent: number;
    sectionsMaxConcurrent: number;
    maxHistoryMessages: number;
    maxTextLength: number;
    maxImageBytes: number;
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
  };
}

const required = (name: string, value: string | undefined): string => {
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

const nodeEnvRaw = (process.env.NODE_ENV || 'development') as NodeEnv;
const nodeEnv: NodeEnv = ['development', 'test', 'production'].includes(
  nodeEnvRaw,
)
  ? nodeEnvRaw
  : 'development';

const providerRaw = (process.env.LLM_PROVIDER || 'openai').toLowerCase();
const provider: LlmProvider = ['openai', 'deepseek', 'google'].includes(
  providerRaw,
)
  ? (providerRaw as LlmProvider)
  : 'openai';

const env: AppEnv = {
  nodeEnv,
  port: toNumber(process.env.PORT, 3000),
  trustProxy: toBoolean(process.env.TRUST_PROXY, true),
  corsOrigins: toList(process.env.CORS_ORIGINS),
  cookieDomain: toCookieDomain(process.env.COOKIE_DOMAIN),
  jsonBodyLimit: process.env.JSON_BODY_LIMIT || '1mb',
  requestTimeoutMs: toNumber(process.env.REQUEST_TIMEOUT_MS, 20000),
  dbSynchronize: toBoolean(
    process.env.DB_SYNCHRONIZE,
    false,
  ),
  db: {
    host: toOptionalString(process.env.DB_HOST) || 'localhost',
    port: toNumber(process.env.DB_PORT, 5432),
    user: toOptionalString(process.env.DB_USER),
    password: toOptionalString(process.env.DB_PASSWORD),
    database: toOptionalString(process.env.PGDATABASE) || 'museumAI',
    poolMax: toNumber(process.env.DB_POOL_MAX, 20),
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET || 'local-dev-jwt-secret',
    sessionSecret: process.env.SESSION_SECRET || 'local-dev-session-secret',
  },
  llm: {
    provider,
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    temperature: toNumber(process.env.LLM_TEMPERATURE, 0.3),
    parallelEnabled: toBoolean(process.env.LLM_PARALLEL_ENABLED, false),
    timeoutMs: toNumber(process.env.LLM_TIMEOUT_MS, 15000),
    timeoutSummaryMs: toNumber(process.env.LLM_TIMEOUT_SUMMARY_MS, 8000),
    timeoutExpertCompactMs: toNumber(
      process.env.LLM_TIMEOUT_EXPERT_COMPACT_MS,
      20000,
    ),
    totalBudgetMs: toNumber(process.env.LLM_TOTAL_BUDGET_MS, 25000),
    retries: toNumber(process.env.LLM_RETRIES, 1),
    retryBaseDelayMs: toNumber(process.env.LLM_RETRY_BASE_DELAY_MS, 250),
    maxConcurrent: toNumber(process.env.LLM_MAX_CONCURRENT, 5),
    sectionsMaxConcurrent: toNumber(process.env.LLM_SECTIONS_MAX_CONCURRENT, 2),
    maxHistoryMessages: toNumber(process.env.LLM_MAX_HISTORY_MESSAGES, 12),
    maxTextLength: toNumber(process.env.LLM_MAX_TEXT_LENGTH, 2000),
    maxImageBytes: toNumber(process.env.LLM_MAX_IMAGE_BYTES, 3 * 1024 * 1024),
    includeDiagnostics: toBoolean(
      process.env.LLM_INCLUDE_DIAGNOSTICS,
      nodeEnv !== 'production',
    ),
    openAiApiKey: process.env.OPENAI_API_KEY,
    deepseekApiKey: process.env.DEEPSEEK_API_KEY,
    googleApiKey: process.env.GOOGLE_API_KEY,
  },
  rateLimit: {
    ipLimit: toNumber(process.env.RATE_LIMIT_IP, 120),
    sessionLimit: toNumber(process.env.RATE_LIMIT_SESSION, 60),
    windowMs: toNumber(process.env.RATE_LIMIT_WINDOW_MS, 60000),
  },
  upload: {
    allowedMimeTypes: toList(process.env.UPLOAD_ALLOWED_MIME_TYPES).length
      ? toList(process.env.UPLOAD_ALLOWED_MIME_TYPES)
      : ['image/jpeg', 'image/png', 'image/webp'],
  },
};

if (env.nodeEnv === 'production') {
  required('JWT_SECRET', process.env.JWT_SECRET);
  required('SESSION_SECRET', process.env.SESSION_SECRET);
  required('PGDATABASE', process.env.PGDATABASE);

  if (env.llm.provider === 'openai') {
    required('OPENAI_API_KEY', env.llm.openAiApiKey);
  }
  if (env.llm.provider === 'deepseek') {
    required('DEEPSEEK_API_KEY', env.llm.deepseekApiKey);
  }
  if (env.llm.provider === 'google') {
    required('GOOGLE_API_KEY', env.llm.googleApiKey);
  }
}

export { env };
export type { AppEnv, LlmProvider };
