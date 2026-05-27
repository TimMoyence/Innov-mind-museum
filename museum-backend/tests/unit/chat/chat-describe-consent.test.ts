/**
 * RED — UFR-022 phase=red, Cycle 3 (B-02), RUN_ID=2026-05-26-chat-pipeline-hardening.
 *
 * Specifies the consent gate on `POST /api/chat/describe`
 * (`museum-backend/src/modules/chat/adapters/primary/http/routes/chat-describe.route.ts:35-75`).
 *
 * Defect proven (B-02, HIGH — GDPR Art. 7 third-party sharing without consent):
 *  - `DescribeService.describe()` (`describe.service.ts:46,65`) calls
 *    `orchestrator.generate(...)` (chat LLM → OpenAI/Google, text+image) and,
 *    when `format` is audio/both, `tts.synthesize(...)` (OpenAI TTS) — BOTH are
 *    third-party AI calls — yet the route does NO consent check whatsoever.
 *  - The route runs only `isAuthenticated → describeLimiter → llmCostGuard →
 *    handler`. There is no equivalent of the STT gate
 *    (`chat-media.route.ts:61-71`).
 *
 * Acceptance shape (gate at ROUTE level, refusal `403 { error:
 * 'consent_required', scope }`; scope resolved via `resolveActiveProviderForScope`
 * keyed on the dispatch channel — `provider-resolver.ts`):
 *  - text-only input, text scope denied → 403 `third_party_ai_text_<provider>`,
 *    `describe()` NOT invoked.
 *  - image input, image scope denied → 403 `third_party_ai_image_<provider>`,
 *    `describe()` NOT invoked.
 *  - text input + `format=audio`, audio scope denied (text granted) → 403
 *    `third_party_ai_audio_openai`, `describe()` NOT invoked.
 *  - all relevant scopes granted → existing happy path (200 + description)
 *    preserved, `describe()` invoked once.
 *  - no token → 401 from `isAuthenticated` BEFORE the gate, `describe()` not
 *    invoked (coherence with the STT/TTS ordering).
 *
 * RED rationale: today the route never consults consent, so EVERY request
 * reaches `describe()` regardless of scope. The 403 + "not invoked" assertions
 * fail until the route-level gate lands; today's behaviour returns 200 and
 * invokes `describe()` once.
 *
 * The gate consults `buildThirdPartyAiConsentChecker()`; we mock that module
 * with a configurable in-memory grant set (mirrors the always-grant mock in
 * `chat-media-route.test.ts:9-13`) so no DB is needed and the denial vs grant
 * branches are exercised deterministically. `LLM_PROVIDER` is left at its test
 * default → `openai` (text→third_party_ai_text_openai, image→…_image_openai).
 */

// ─── 1. Configurable consent-checker mock (hoisted before imports) ───────────
const grantedScopes = new Set<string>();

jest.mock('@modules/chat/useCase/third-party-ai-consent-checker', () => ({
  buildThirdPartyAiConsentChecker: () => ({
    isGranted: async (userId: number | undefined | null, scope: string) =>
      await Promise.resolve(userId !== undefined && userId !== null && grantedScopes.has(scope)),
  }),
}));

// ─── 2. Imports (top-level — Jest hoists jest.mock above these) ──────────────
import express from 'express';
import request from 'supertest';

import { createDescribeRouter } from '@modules/chat/adapters/primary/http/routes/chat-describe.route';
import { errorHandler } from '@shared/middleware/error.middleware';
import {
  clearRateLimitBuckets,
  stopRateLimitSweep,
} from '@shared/middleware/rate-limit.middleware';

import { visitorToken } from '../../helpers/auth/token.helpers';

import type { DescribeService } from '@modules/chat/useCase/describe.service';

const TEXT_SCOPE = 'third_party_ai_text_openai';
const IMAGE_SCOPE = 'third_party_ai_image_openai';
const AUDIO_SCOPE = 'third_party_ai_audio_openai';

const buildApp = (service: DescribeService) => {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/chat', createDescribeRouter(service));
  app.use(errorHandler);
  return app;
};

const makeServiceMock = (overrides: Partial<DescribeService> = {}): DescribeService =>
  ({
    describe: jest.fn().mockResolvedValue({
      description: 'A serene landscape.',
      metadata: { tokensUsed: 42 },
    }),
    ...overrides,
  }) as unknown as DescribeService;

describe('POST /api/chat/describe — third-party AI consent gate (B-02)', () => {
  beforeEach(() => {
    clearRateLimitBuckets();
    grantedScopes.clear();
    jest.clearAllMocks();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('returns 403 consent_required (text scope) for text-only input when text scope is denied', async () => {
    const service = makeServiceMock();
    const app = buildApp(service);

    const res = await request(app)
      .post('/api/chat/describe')
      .set('Authorization', `Bearer ${visitorToken()}`)
      .send({ text: 'What is shown here?', locale: 'fr' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'consent_required', scope: TEXT_SCOPE });
    expect(service.describe).not.toHaveBeenCalled();
  });

  it('returns 403 consent_required (image scope) for image input when image scope is denied', async () => {
    grantedScopes.add(TEXT_SCOPE); // text granted but image is the binding scope here
    const service = makeServiceMock();
    const app = buildApp(service);

    const res = await request(app)
      .post('/api/chat/describe')
      .set('Authorization', `Bearer ${visitorToken()}`)
      .send({
        image: { source: 'base64', value: 'abc123', mimeType: 'image/jpeg' },
        locale: 'fr',
      });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'consent_required', scope: IMAGE_SCOPE });
    expect(service.describe).not.toHaveBeenCalled();
  });

  it('returns 403 consent_required (audio scope) when format=audio and audio scope is denied (text granted)', async () => {
    grantedScopes.add(TEXT_SCOPE); // text allowed, but TTS audio scope missing
    const service = makeServiceMock();
    const app = buildApp(service);

    const res = await request(app)
      .post('/api/chat/describe')
      .set('Authorization', `Bearer ${visitorToken()}`)
      .send({ text: 'Describe this', format: 'audio' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'consent_required', scope: AUDIO_SCOPE });
    expect(service.describe).not.toHaveBeenCalled();
  });

  it('does NOT invoke describe() on any denial (no third-party call leaks through)', async () => {
    const service = makeServiceMock();
    const app = buildApp(service);

    await request(app)
      .post('/api/chat/describe')
      .set('Authorization', `Bearer ${visitorToken()}`)
      .send({ text: 'leak attempt', locale: 'en' });

    expect(service.describe).not.toHaveBeenCalled();
  });

  it('returns 200 + description when text scope is granted (happy path preserved)', async () => {
    grantedScopes.add(TEXT_SCOPE);
    const service = makeServiceMock();
    const app = buildApp(service);

    const res = await request(app)
      .post('/api/chat/describe')
      .set('Authorization', `Bearer ${visitorToken()}`)
      .send({ text: 'What is shown here?', locale: 'fr' });

    expect(res.status).toBe(200);
    expect(res.body.description).toBe('A serene landscape.');
    expect(service.describe).toHaveBeenCalledTimes(1);
  });

  it('returns 200 when image + format=both and image+audio scopes are granted', async () => {
    grantedScopes.add(IMAGE_SCOPE);
    grantedScopes.add(AUDIO_SCOPE);
    const service = makeServiceMock({
      describe: jest.fn().mockResolvedValue({
        description: 'A vivid description.',
        audio: Buffer.from([0x00, 0x01, 0x02]),
        contentType: 'audio/ogg',
        metadata: {},
      }),
    });
    const app = buildApp(service);

    const res = await request(app)
      .post('/api/chat/describe')
      .set('Authorization', `Bearer ${visitorToken()}`)
      .send({
        image: { source: 'base64', value: 'abc123', mimeType: 'image/jpeg' },
        format: 'both',
      });

    expect(res.status).toBe(200);
    expect(service.describe).toHaveBeenCalledTimes(1);
  });

  it('returns 401 (not 403) when no token is provided — auth runs before the gate', async () => {
    const service = makeServiceMock();
    const app = buildApp(service);

    const res = await request(app).post('/api/chat/describe').send({ text: 'hello' });

    expect(res.status).toBe(401);
    expect(service.describe).not.toHaveBeenCalled();
  });
});
