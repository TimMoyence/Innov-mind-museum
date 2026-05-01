/**
 * Tests for the env.ts module's actual behavior at import time.
 *
 * Because env.ts is a singleton that runs on import, each test that needs
 * different env vars must use jest.resetModules() and re-require.
 *
 * Complementary to env-helpers.test.ts which tests the helper functions
 * via local copies. These tests exercise the real module.
 */

import { validProductionEnv } from '../../helpers/config/prod-env.fixtures';

describe('env.ts module', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  /**
   * Helper to import env.ts fresh with controlled env vars.
   * @param envOverrides
   */
  function loadEnv(envOverrides: Record<string, string | undefined> = {}) {
    // Set NODE_ENV to test by default to avoid production validation
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      ...envOverrides,
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic re-import needed for module-level singleton
    const mod = require('@src/config/env') as typeof import('@src/config/env');
    return mod.env;
  }

  describe('LLM provider fallback', () => {
    it('defaults to openai when LLM_PROVIDER is not set', () => {
      const env = loadEnv({ LLM_PROVIDER: undefined });
      expect(env.llm.provider).toBe('openai');
    });

    it('uses google when LLM_PROVIDER is "google"', () => {
      const env = loadEnv({ LLM_PROVIDER: 'google' });
      expect(env.llm.provider).toBe('google');
    });

    it('uses deepseek when LLM_PROVIDER is "deepseek"', () => {
      const env = loadEnv({ LLM_PROVIDER: 'deepseek' });
      expect(env.llm.provider).toBe('deepseek');
    });

    it('falls back to openai for unknown provider', () => {
      const env = loadEnv({ LLM_PROVIDER: 'unknown-llm' });
      expect(env.llm.provider).toBe('openai');
    });

    it('handles case-insensitive provider', () => {
      const env = loadEnv({ LLM_PROVIDER: 'Google' });
      expect(env.llm.provider).toBe('google');
    });
  });

  describe('CORS_ORIGINS parsing', () => {
    it('parses comma-separated origins', () => {
      const env = loadEnv({
        CORS_ORIGINS: 'https://app.example.com,https://admin.example.com',
      });
      expect(env.corsOrigins).toEqual(['https://app.example.com', 'https://admin.example.com']);
    });

    it('returns empty array when CORS_ORIGINS is not set', () => {
      const env = loadEnv({ CORS_ORIGINS: undefined });
      expect(env.corsOrigins).toEqual([]);
    });

    it('trims whitespace in origins', () => {
      const env = loadEnv({
        CORS_ORIGINS: '  https://a.com , https://b.com  ',
      });
      expect(env.corsOrigins).toEqual(['https://a.com', 'https://b.com']);
    });
  });

  describe('toOptionalString behavior (via env fields)', () => {
    it('returns undefined for empty BREVO_API_KEY', () => {
      const env = loadEnv({ BREVO_API_KEY: '' });
      expect(env.brevoApiKey).toBeUndefined();
    });

    it('returns undefined for whitespace-only BREVO_API_KEY', () => {
      const env = loadEnv({ BREVO_API_KEY: '   ' });
      expect(env.brevoApiKey).toBeUndefined();
    });

    it('returns trimmed string for valid BREVO_API_KEY', () => {
      const env = loadEnv({ BREVO_API_KEY: '  key-123  ' });
      expect(env.brevoApiKey).toBe('key-123');
    });

    it('returns undefined for missing UNSPLASH_ACCESS_KEY', () => {
      const env = loadEnv({ UNSPLASH_ACCESS_KEY: undefined });
      expect(env.imageEnrichment.unsplashAccessKey).toBeUndefined();
    });
  });

  describe('numeric defaults', () => {
    it('uses 3000 as default port', () => {
      const env = loadEnv({ PORT: undefined });
      expect(env.port).toBe(3000);
    });

    it('parses PORT from env', () => {
      const env = loadEnv({ PORT: '8080' });
      expect(env.port).toBe(8080);
    });

    it('falls back to default for non-numeric PORT', () => {
      const env = loadEnv({ PORT: 'not-a-number' });
      expect(env.port).toBe(3000);
    });

    it('uses default LLM temperature of 0.3', () => {
      const env = loadEnv({ LLM_TEMPERATURE: undefined });
      expect(env.llm.temperature).toBeCloseTo(0.3);
    });
  });

  describe('boolean defaults', () => {
    it('DB_SYNCHRONIZE defaults to false', () => {
      const env = loadEnv({ DB_SYNCHRONIZE: undefined });
      expect(env.dbSynchronize).toBe(false);
    });

    it('TRUST_PROXY defaults to true', () => {
      const env = loadEnv({ TRUST_PROXY: undefined });
      expect(env.trustProxy).toBe(true);
    });
  });

  describe('optional sections (TTS, cache, sentry, otel)', () => {
    it('tts is always populated (TTS_ENABLED was retired in V1)', () => {
      const env = loadEnv({});
      expect(env.tts).toBeDefined();
      // Default model upgraded from tts-1 to gpt-4o-mini-tts in V1.
      expect(env.tts.model).toBe('gpt-4o-mini-tts');
    });

    it('tts model is overridable via TTS_MODEL', () => {
      const env = loadEnv({ TTS_MODEL: 'tts-1-hd' });
      expect(env.tts.model).toBe('tts-1-hd');
    });

    it('cache is undefined when CACHE_ENABLED is not set', () => {
      const env = loadEnv({ CACHE_ENABLED: undefined });
      expect(env.cache).toBeUndefined();
    });

    it('cache is populated when CACHE_ENABLED is true', () => {
      const env = loadEnv({
        CACHE_ENABLED: 'true',
        REDIS_URL: 'redis://custom:6380',
      });
      expect(env.cache?.enabled).toBe(true);
      expect(env.cache?.url).toBe('redis://custom:6380');
    });

    it('cache.password reflects REDIS_PASSWORD env var', () => {
      const env = loadEnv({
        CACHE_ENABLED: 'true',
        REDIS_URL: 'redis://custom:6380',
        REDIS_PASSWORD: 'my-strong-pw',
      });
      expect(env.cache?.password).toBe('my-strong-pw');
    });

    it('cache.password falls back to URL-embedded password', () => {
      const env = loadEnv({
        CACHE_ENABLED: 'true',
        REDIS_URL: 'redis://:url-pw@custom:6380',
        REDIS_PASSWORD: undefined,
      });
      expect(env.cache?.password).toBe('url-pw');
    });

    it('cache.password prefers REDIS_PASSWORD over URL-embedded password', () => {
      const env = loadEnv({
        CACHE_ENABLED: 'true',
        REDIS_URL: 'redis://:url-pw@custom:6380',
        REDIS_PASSWORD: 'env-pw',
      });
      expect(env.cache?.password).toBe('env-pw');
    });

    it('sentry is undefined when SENTRY_DSN is not set', () => {
      const env = loadEnv({ SENTRY_DSN: undefined });
      expect(env.sentry).toBeUndefined();
    });

    it('sentry is populated when SENTRY_DSN is set', () => {
      const env = loadEnv({ SENTRY_DSN: 'https://abc@sentry.io/123' });
      expect(env.sentry?.dsn).toBe('https://abc@sentry.io/123');
      expect(env.sentry?.environment).toBe('test');
    });

    it('otel is undefined when OTEL_ENABLED is not set', () => {
      const env = loadEnv({ OTEL_ENABLED: undefined });
      expect(env.otel).toBeUndefined();
    });
  });

  // feature-flags block retired 2026-04-22 — all features always-on (no env-driven flags remain).

  describe('NODE_ENV validation', () => {
    it('throws on invalid NODE_ENV', () => {
      expect(() => {
        loadEnv({ NODE_ENV: 'staging' });
      }).toThrow('Invalid NODE_ENV="staging"');
    });

    it('accepts "development"', () => {
      const env = loadEnv({ NODE_ENV: 'development' });
      expect(env.nodeEnv).toBe('development');
    });

    it('accepts "production" (with required vars)', () => {
      const env = loadEnv(validProductionEnv());
      expect(env.nodeEnv).toBe('production');
    });
  });

  describe('production validation', () => {
    it('throws when JWT_ACCESS_SECRET is missing in production', () => {
      expect(() => {
        loadEnv(
          validProductionEnv({
            JWT_ACCESS_SECRET: undefined,
            JWT_SECRET: undefined,
          }),
        );
      }).toThrow(/Missing required environment variable/);
    });

    it('throws when PGDATABASE is missing in production', () => {
      expect(() => {
        loadEnv(validProductionEnv({ PGDATABASE: undefined }));
      }).toThrow(/Missing required environment variable/);
    });

    it('throws when CORS_ORIGINS is missing in production', () => {
      expect(() => {
        loadEnv(validProductionEnv({ CORS_ORIGINS: undefined }));
      }).toThrow(/Missing required environment variable/);
    });

    it('does not throw for missing secrets in test mode', () => {
      expect(() => {
        loadEnv({
          NODE_ENV: 'test',
          JWT_ACCESS_SECRET: undefined,
          JWT_SECRET: undefined,
          JWT_REFRESH_SECRET: undefined,
          PGDATABASE: undefined,
        });
      }).not.toThrow();
    });
  });

  describe('LLM diagnostics', () => {
    it('forces includeDiagnostics false in production', () => {
      const env = loadEnv(validProductionEnv({ LLM_INCLUDE_DIAGNOSTICS: 'true' }));
      expect(env.llm.includeDiagnostics).toBe(false);
    });

    it('allows includeDiagnostics true in development', () => {
      const env = loadEnv({
        NODE_ENV: 'development',
        LLM_INCLUDE_DIAGNOSTICS: 'true',
      });
      expect(env.llm.includeDiagnostics).toBe(true);
    });

    it('forces includeDiagnostics false in test (strict-dev-only, F13)', () => {
      const env = loadEnv({
        NODE_ENV: 'test',
        LLM_INCLUDE_DIAGNOSTICS: 'true',
      });
      expect(env.llm.includeDiagnostics).toBe(false);
    });
  });

  describe('redis URL fallback (parseRedisUrlFallback)', () => {
    it('prefers REDIS_HOST over REDIS_URL when both are set', () => {
      const env = loadEnv({
        REDIS_HOST: 'explicit-host',
        REDIS_PORT: '6399',
        REDIS_PASSWORD: 'explicit-pw',
        REDIS_URL: 'redis://ignored-host:1234',
      });
      expect(env.redis.host).toBe('explicit-host');
      expect(env.redis.port).toBe(6399);
      expect(env.redis.password).toBe('explicit-pw');
    });

    it('parses REDIS_URL host/port when REDIS_HOST is absent', () => {
      const env = loadEnv({
        REDIS_HOST: undefined,
        REDIS_PORT: undefined,
        REDIS_PASSWORD: undefined,
        REDIS_URL: 'redis://redis:6379',
      });
      expect(env.redis.host).toBe('redis');
      expect(env.redis.port).toBe(6379);
      expect(env.redis.password).toBeUndefined();
    });

    it('parses REDIS_URL with password and custom port', () => {
      const env = loadEnv({
        REDIS_HOST: undefined,
        REDIS_PORT: undefined,
        REDIS_PASSWORD: undefined,
        REDIS_URL: 'redis://:mypass@myhost:6380',
      });
      expect(env.redis.host).toBe('myhost');
      expect(env.redis.port).toBe(6380);
      expect(env.redis.password).toBe('mypass');
    });

    it('defaults to localhost:6379 when neither REDIS_HOST nor REDIS_URL is set', () => {
      const env = loadEnv({
        REDIS_HOST: undefined,
        REDIS_PORT: undefined,
        REDIS_PASSWORD: undefined,
        REDIS_URL: undefined,
      });
      expect(env.redis.host).toBe('localhost');
      expect(env.redis.port).toBe(6379);
      expect(env.redis.password).toBeUndefined();
    });

    it('falls back to defaults when REDIS_URL is malformed', () => {
      const env = loadEnv({
        REDIS_HOST: undefined,
        REDIS_PORT: undefined,
        REDIS_PASSWORD: undefined,
        REDIS_URL: 'not-a-valid-url:::',
      });
      expect(env.redis.host).toBe('localhost');
      expect(env.redis.port).toBe(6379);
      expect(env.redis.password).toBeUndefined();
    });
  });

  describe('museumEnrichmentSchedulerEnabled flag', () => {
    it('defaults to false when MUSEUM_ENRICHMENT_SCHEDULER_ENABLED is unset', () => {
      const env = loadEnv({ MUSEUM_ENRICHMENT_SCHEDULER_ENABLED: undefined });
      expect(env.museumEnrichmentSchedulerEnabled).toBe(false);
    });

    it('is true when MUSEUM_ENRICHMENT_SCHEDULER_ENABLED=true', () => {
      const env = loadEnv({ MUSEUM_ENRICHMENT_SCHEDULER_ENABLED: 'true' });
      expect(env.museumEnrichmentSchedulerEnabled).toBe(true);
    });

    it('is false when MUSEUM_ENRICHMENT_SCHEDULER_ENABLED=false', () => {
      const env = loadEnv({ MUSEUM_ENRICHMENT_SCHEDULER_ENABLED: 'false' });
      expect(env.museumEnrichmentSchedulerEnabled).toBe(false);
    });

    it('is independent of EXTRACTION_WORKER_ENABLED', () => {
      const env = loadEnv({
        EXTRACTION_WORKER_ENABLED: 'true',
        MUSEUM_ENRICHMENT_SCHEDULER_ENABLED: undefined,
      });
      expect(env.extractionWorkerEnabled).toBe(true);
      expect(env.museumEnrichmentSchedulerEnabled).toBe(false);
    });
  });

  describe('storage driver', () => {
    it('defaults to local when OBJECT_STORAGE_DRIVER is not set', () => {
      const env = loadEnv({ OBJECT_STORAGE_DRIVER: undefined });
      expect(env.storage.driver).toBe('local');
    });

    it('uses s3 when OBJECT_STORAGE_DRIVER is "s3"', () => {
      const env = loadEnv({ OBJECT_STORAGE_DRIVER: 's3' });
      expect(env.storage.driver).toBe('s3');
    });

    it('falls back to local for unknown driver', () => {
      const env = loadEnv({ OBJECT_STORAGE_DRIVER: 'gcs' });
      expect(env.storage.driver).toBe('local');
    });
  });
});
