/**
 * Phase 5 sentinel: production env MUST reject AUTH_EMAIL_SERVICE_KIND='test'.
 *
 * The auth composition root has a test-only branch that swaps in
 * TestEmailService when this env var is 'test'. Production must never
 * accept that value or the in-memory email service would silently
 * eat real verification emails.
 *
 * Strategy: call validateProductionEnv() directly with a minimal AppEnv stub
 * where emailServiceKind='test'. This avoids Jest module-cache issues with
 * re-importing env.ts (which only runs its top-level code once per worker).
 */
import { validateProductionEnv } from '@src/config/env.production-validation';
import type { AppEnv } from '@src/config/env.types';
import { createIntegrationHarness } from 'tests/helpers/integration/integration-harness';

/**
 * Minimal valid production AppEnv stub — only fields inspected by validateProductionEnv.
 * @param overrides
 */
function makeProductionEnvStub(overrides: Partial<AppEnv['auth']> = {}): AppEnv {
  const auth: AppEnv['auth'] = {
    jwtSecret: 'a'.repeat(32),
    accessTokenSecret: 'b'.repeat(32),
    refreshTokenSecret: 'c'.repeat(32),
    accessTokenTtl: '15m',
    refreshTokenTtl: '14d',
    refreshIdleWindowSeconds: 86400,
    appleClientId: 'com.musaium.mobile',
    googleClientIds: ['test-audience'],
    appleJwksUrl: 'https://appleid.apple.com/auth/keys',
    googleJwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
    mfaEncryptionKey: 'd'.repeat(32),
    mfaSessionTokenSecret: 'e'.repeat(32),
    mfaSessionTokenTtlSeconds: 300,
    mfaEnrollmentWarningDays: 30,
    oidcNonceEnforce: false,
    csrfSecret: 'f'.repeat(32),
    emailServiceKind: 'brevo',
    passwordBreachCheckEnabled: true,
    ...overrides,
  };

  return {
    nodeEnv: 'production',
    deploymentMode: 'single',
    port: 3000,
    appVersion: '1.0.0',
    trustProxy: true,
    corsOrigins: [],
    jsonBodyLimit: '1mb',
    requestTimeoutMs: 20000,
    dbSynchronize: false,
    dbSsl: true,
    dbSslRejectUnauthorized: true,
    db: { host: 'localhost', port: 5432, database: 'museumAI', poolMax: 50, replicaUrl: null },
    auth,
    llm: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      audioTranscriptionModel: 'gpt-4o-mini-transcribe',
      temperature: 0.3,
      timeoutMs: 15000,
      timeoutSummaryMs: 10000,
      totalBudgetMs: 25000,
      retries: 1,
      retryBaseDelayMs: 250,
      maxConcurrent: 20,
      maxHistoryMessages: 12,
      maxTextLength: 2000,
      maxImageBytes: 3145728,
      maxAudioBytes: 12582912,
      maxOutputTokens: 800,
      includeDiagnostics: false,
      costGuard: { killSwitch: false, userDailyCapUsd: 0.5 },
    },
    rateLimit: {
      ipLimit: 200,
      sessionLimit: 120,
      userLimit: 200,
      windowMs: 60000,
      failClosed: true,
    },
    upload: { allowedMimeTypes: ['image/jpeg'], allowedAudioMimeTypes: ['audio/mpeg'] },
    storage: {
      driver: 'local',
      localUploadsDir: '/tmp/uploads',
      signedUrlTtlSeconds: 900,
      signingSecret: 'g'.repeat(32),
    },
    tts: {
      model: 'gpt-4o-mini-tts',
      voice: 'alloy',
      speed: 1,
      maxTextLength: 4096,
      cacheTtlSeconds: 86400,
    },
    freeTierDailyChatLimit: 100,
    freeTierMonthlySessionLimit: 3,
    overpassCacheTtlSeconds: 86400,
    overpass: { cacheTtlSeconds: 86400, negativeCacheTtlSeconds: 3600 },
    chatPurgeRetentionDays: 180,
    knowledgeBase: {
      timeoutMs: 500,
      cacheTtlSeconds: 3600,
      cacheMaxEntries: 500,
      breaker: {
        timeoutMs: 5000,
        errorThresholdPercentage: 50,
        resetTimeoutMs: 30000,
        volumeThreshold: 5,
        capacity: 5,
      },
      localDumpFallbackAfterMs: 60000,
    },
    knowledgeRouter: { threshold: 0.7, kbTimeoutMs: 200, judgeTimeoutMs: 500, wsTimeoutMs: 1500 },
    wikidata: { userAgent: 'Musaium/1.0 (test)' },
    nominatim: {
      contactEmail: 'contact@musaium.app',
      cacheTtlSeconds: 86400,
      negativeCacheTtlSeconds: 3600,
      minRequestIntervalMs: 1000,
    },
    imageEnrichment: {
      cacheTtlMs: 3600000,
      cacheMaxEntries: 200,
      fetchTimeoutMs: 3000,
      maxImagesPerResponse: 5,
    },
    visualSimilarity: {
      provider: 'siglip-onnx',
      siglipOnnxModelPath: './models/siglip-base-patch16-224.onnx',
      embeddingsDim: 768,
      topN: 20,
      topKDefault: 5,
      wVisual: 0.7,
      wMeta: 0.3,
      fallbackVisualThreshold: 0.4,
      embeddingsCacheTtlMs: 3600000,
      encodeTimeoutMs: 3000,
    },
    enrichment: { hardDeleteAfterDays: 180 },
    webSearch: {
      searxngInstances: [],
      timeoutMs: 3000,
      cacheTtlSeconds: 3600,
      maxResults: 5,
    },
    extraction: {
      queueConcurrency: 2,
      queueRateLimit: 60,
      scrapeTimeoutMs: 5000,
      contentMaxBytes: 51200,
      refetchAfterDays: 7,
      llmModel: 'gpt-4o-mini',
      confidenceThreshold: 0.7,
      reviewThreshold: 0.4,
    },
    extractionWorkerEnabled: true,
    museumEnrichmentSchedulerEnabled: false,
    redis: { host: 'localhost', port: 6379, clusterNodes: null },
    guardrails: {
      timeoutMs: 300,
      observeOnly: false,
      budgetCentsPerDay: 0,
      judgeTimeoutMs: 500,
      judgeMinMessageLength: 50,
      budgetBackend: 'memory',
      circuitBreaker: {
        failureThreshold: 5,
        windowMs: 60_000,
        openDurationMs: 30_000,
        halfOpenMaxProbes: 1,
      },
      maxInflight: 8,
      queueMax: 32,
      chaosRate: 0,
      presidio: { timeoutMs: 500 },
      llamaPromptGuard: { timeoutMs: 500, scoreThreshold: 0.8 },
      costCircuitBreaker: {
        hourlyThresholdCents: 5_000,
        dailyBudgetCents: 50_000,
        openDurationMs: 300_000,
      },
      tenantRateLimit: { capacity: 60, refillPerSecond: 1.0 },
    },
    retention: {
      cronPattern: '15 3 * * *',
      batchLimit: 1000,
      supportTicketsDays: 365,
      reviewsRejectedDays: 30,
      reviewsPendingDays: 60,
      artKeywordsDays: 90,
      artKeywordsHitThreshold: 1,
    },
    supportInboxEmail: 'support@musaium.app',
  };
}

describe('auth: AUTH_EMAIL_SERVICE_KIND=test rejected in production', () => {
  it('validateProductionEnv throws when emailServiceKind=test', () => {
    const stub = makeProductionEnvStub({ emailServiceKind: 'test' });

    // Provide the required production env vars so JWT secret checks pass
    const saved = {
      JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
      MFA_ENCRYPTION_KEY: process.env.MFA_ENCRYPTION_KEY,
      MFA_SESSION_TOKEN_SECRET: process.env.MFA_SESSION_TOKEN_SECRET,
      CSRF_SECRET: process.env.CSRF_SECRET,
      MEDIA_SIGNING_SECRET: process.env.MEDIA_SIGNING_SECRET,
    };
    process.env.JWT_ACCESS_SECRET = 'b'.repeat(32);
    process.env.JWT_REFRESH_SECRET = 'c'.repeat(32);
    process.env.MFA_ENCRYPTION_KEY = 'd'.repeat(32);
    process.env.MFA_SESSION_TOKEN_SECRET = 'e'.repeat(32);
    process.env.CSRF_SECRET = 'f'.repeat(32);
    process.env.MEDIA_SIGNING_SECRET = 'g'.repeat(32);

    let threwExpected = false;
    try {
      validateProductionEnv(stub);
    } catch (err) {
      const msg = (err as Error).message.toLowerCase();
      threwExpected = msg.includes('test') && msg.includes('production');
    } finally {
      // Restore
      for (const [key, val] of Object.entries(saved)) {
        if (val === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = val;
        }
      }
    }

    expect(threwExpected).toBe(true);
  });

  it('createIntegrationHarness boots fine with default kind', async () => {
    // Smoke that the integration harness does not regress under default env.
    const harness = await createIntegrationHarness();
    harness.scheduleStop();
    const result = await harness.dataSource.query<{ ok: number }[]>('SELECT 1 as ok');
    expect(result).toEqual([{ ok: 1 }]);
  });
});
