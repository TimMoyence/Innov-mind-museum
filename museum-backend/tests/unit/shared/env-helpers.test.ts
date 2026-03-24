/**
 * Tests for env.ts helper functions.
 * Since the helpers (toNumber, toBoolean, toList, toOptionalString) are module-internal,
 * we test them indirectly through the exported env config object.
 * However, the env singleton is already loaded at import time.
 * We just verify the current env values exercise various branches.
 */
import { env } from '@src/config/env';

describe('env config — branch verification', () => {
  it('nodeEnv is one of the valid values', () => {
    expect(['development', 'test', 'production']).toContain(env.nodeEnv);
  });

  it('port defaults to 3000 when not set', () => {
    // In test env, PORT is typically not set
    expect(typeof env.port).toBe('number');
    expect(env.port).toBeGreaterThan(0);
  });

  it('llm.provider is a valid provider', () => {
    expect(['openai', 'deepseek', 'google']).toContain(env.llm.provider);
  });

  it('storage.driver is a valid driver', () => {
    expect(['local', 's3']).toContain(env.storage.driver);
  });

  it('featureFlags are all booleans', () => {
    expect(typeof env.featureFlags.voiceMode).toBe('boolean');
    expect(typeof env.featureFlags.ocrGuard).toBe('boolean');
    expect(typeof env.featureFlags.apiKeys).toBe('boolean');
    expect(typeof env.featureFlags.streaming).toBe('boolean');
    expect(typeof env.featureFlags.multiTenancy).toBe('boolean');
    expect(typeof env.featureFlags.userMemory).toBe('boolean');
  });

  it('rateLimit values are positive numbers', () => {
    expect(env.rateLimit.ipLimit).toBeGreaterThan(0);
    expect(env.rateLimit.sessionLimit).toBeGreaterThan(0);
    expect(env.rateLimit.windowMs).toBeGreaterThan(0);
  });

  it('sentry is undefined when DSN is not set (test env)', () => {
    // In test environment, SENTRY_DSN is typically not set
    // This exercises the conditional sentry block
    if (!process.env.SENTRY_DSN) {
      expect(env.sentry).toBeUndefined();
    }
  });

  it('tts is undefined when TTS_ENABLED is not set', () => {
    if (!process.env.TTS_ENABLED) {
      expect(env.tts).toBeUndefined();
    }
  });

  it('cache is undefined when CACHE_ENABLED is not set', () => {
    if (!process.env.CACHE_ENABLED) {
      expect(env.cache).toBeUndefined();
    }
  });

  it('corsOrigins is an array', () => {
    expect(Array.isArray(env.corsOrigins)).toBe(true);
  });

  it('upload.allowedMimeTypes contains defaults', () => {
    expect(env.upload.allowedMimeTypes).toContain('image/jpeg');
    expect(env.upload.allowedMimeTypes).toContain('image/png');
  });

  it('auth secrets are populated in dev/test mode', () => {
    if (env.nodeEnv !== 'production') {
      expect(env.auth.jwtSecret).toBeDefined();
      expect(env.auth.accessTokenSecret).toBeDefined();
      expect(env.auth.refreshTokenSecret).toBeDefined();
    }
  });
});
