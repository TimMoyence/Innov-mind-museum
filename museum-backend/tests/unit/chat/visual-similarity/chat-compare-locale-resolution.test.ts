/**
 * RED — UFR-022 phase=red, Cycle 12 (MEDIUM — i18n region-tag normalisation),
 * RUN_ID=2026-05-26-chat-pipeline-hardening.
 *
 * Specifies the locale resolution on `POST /chat/compare`
 * (`museum-backend/src/modules/chat/adapters/primary/http/routes/chat-compare.route.ts:85-91`).
 *
 * Defect proven (fr-FR → English copy): the route's private `resolveLocale`
 * does a strict equality check —
 *   `if (clientLocale === 'fr' || clientLocale === 'en') return clientLocale;`
 * — against `req.clientLocale`, which is the RAW first Accept-Language tag from
 * `parseAcceptLanguageHeader` (`shared/i18n/locale.ts:39`), e.g. `'fr-FR'`.
 * `'fr-FR' === 'fr'` is false, so a French client with `Accept-Language: fr-FR`
 * and no explicit `body.locale` falls through to `DEFAULT_LOCALE = 'en'` and
 * gets English compare copy. The main LLM pipeline avoids this because it
 * normalises via `extractLangCode` (`locale.ts:20`, split on `-`/`_`); the
 * compare route should do the same.
 *
 * Observable under test: `resolveLocale` is NOT exported (it is a module-private
 * `function`), so we assert the OBSERVABLE — the `locale` value the route
 * forwards to `compareImageUseCase`. We mount the production
 * `acceptLanguageMiddleware` ahead of the router so `req.clientLocale` is
 * populated from the real header exactly as in prod, and we mock
 * `buildThirdPartyAiConsentChecker` (granting the image scope) so the request
 * reaches the use-case deterministically without a DB (same seam as
 * `chat-compare-consent.test.ts`).
 *
 * RED rationale: today the `fr-FR`-without-body-locale case forwards
 * `locale: 'en'` to the use-case, so the `toBe('fr')` assertion FAILS until the
 * route normalises the client locale via `extractLangCode`. `en-US`, the
 * explicit-body-locale precedence, and the no-locale DEFAULT are passing
 * non-regression guards.
 */

// ─── 1. Consent-checker mock (hoisted before imports) — grant the image scope ─
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

import { createCompareRouter } from '@modules/chat/adapters/primary/http/routes/chat-compare.route';
import { acceptLanguageMiddleware } from '@shared/middleware/accept-language.middleware';
import { errorHandler } from '@shared/middleware/error.middleware';
import {
  makeCompareMatch,
  makeCompareResult,
} from 'tests/helpers/chat/visual-similarity/compare.fixtures';
import { makeSiglipJpegBuffer } from 'tests/helpers/chat/visual-similarity/image-fixtures';
import { resetRateLimits, stopRateLimitSweep } from 'tests/helpers/http/route-test-setup';
import { userToken } from 'tests/helpers/auth/token.helpers';

import type { CompareResult } from '@modules/chat/domain/visual-similarity/compare-result.types';
import type { Express } from 'express';

// Test-default LLM_PROVIDER → 'openai' → image dispatch scope.
const IMAGE_SCOPE = 'third_party_ai_image_openai';

const VALID_SESSION_ID = '8c7b1e0a-3f4d-4e21-9b6a-1c2d3e4f5a6b';

interface CompareUseCaseInput {
  sessionId: string;
  buffer: Buffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  topK: number;
  locale: 'fr' | 'en';
  museumQids?: string[];
  ownerId?: number;
}

/**
 * Boots a minimal Express app mounting the production `acceptLanguageMiddleware`
 * ahead of the compare router behind `/chat`. The Accept-Language header is the
 * ONLY source of `req.clientLocale` here — exactly the prod wiring — so the test
 * exercises the real raw-tag → resolved-locale path.
 * @param compareImageUseCase - the use-case spy whose `locale` arg we assert.
 * @returns A configured Express app ready for supertest.
 */
function buildApp(
  compareImageUseCase: jest.Mock<Promise<CompareResult>, [CompareUseCaseInput]>,
): Express {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(acceptLanguageMiddleware);
  app.use(
    '/chat',
    createCompareRouter({
      compareImageUseCase,
      verifySessionAccess: async () => ({ museumId: null }),
    }),
  );
  app.use(errorHandler);
  return app;
}

/**
 * Default use-case mock returning one populated match.
 * @returns A jest mock resolving with a single-match CompareResult.
 */
function buildHappyUseCase(): jest.Mock<Promise<CompareResult>, [CompareUseCaseInput]> {
  return jest
    .fn<Promise<CompareResult>, [CompareUseCaseInput]>()
    .mockResolvedValue(makeCompareResult({ matches: [makeCompareMatch()] }));
}

/**
 * Reads the `locale` the route forwarded to the use-case from its first call.
 * @param spy - the compare use-case jest mock.
 * @returns The resolved locale (`'fr' | 'en'`) passed to the use-case.
 */
function forwardedLocale(
  spy: jest.Mock<Promise<CompareResult>, [CompareUseCaseInput]>,
): 'fr' | 'en' | undefined {
  return spy.mock.calls[0]?.[0]?.locale;
}

describe('POST /chat/compare — client-locale resolution (Cycle 12 i18n)', () => {
  let imageBuffer: Buffer;

  beforeAll(async () => {
    imageBuffer = await makeSiglipJpegBuffer();
  });

  beforeEach(() => {
    resetRateLimits();
    grantedScopes.clear();
    grantedScopes.add(IMAGE_SCOPE);
    jest.clearAllMocks();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  // ── BUG — region tag fr-FR (no body.locale) must resolve to 'fr' ──────
  it('resolves "fr" from Accept-Language "fr-FR" when no body.locale is sent', async () => {
    const compareImageUseCase = buildHappyUseCase();
    const app = buildApp(compareImageUseCase);

    const res = await request(app)
      .post('/chat/compare')
      .set('Authorization', `Bearer ${userToken()}`)
      .set('Accept-Language', 'fr-FR')
      .field('sessionId', VALID_SESSION_ID)
      .field('topK', '5')
      .attach('image', imageBuffer, { filename: 'fixture.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(compareImageUseCase).toHaveBeenCalledTimes(1);
    expect(forwardedLocale(compareImageUseCase)).toBe('fr');
  });

  // ── region tag en-US (no body.locale) resolves to 'en' ───────────────
  it('resolves "en" from Accept-Language "en-US" when no body.locale is sent', async () => {
    const compareImageUseCase = buildHappyUseCase();
    const app = buildApp(compareImageUseCase);

    const res = await request(app)
      .post('/chat/compare')
      .set('Authorization', `Bearer ${userToken()}`)
      .set('Accept-Language', 'en-US,en;q=0.9')
      .field('sessionId', VALID_SESSION_ID)
      .field('topK', '5')
      .attach('image', imageBuffer, { filename: 'fixture.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(forwardedLocale(compareImageUseCase)).toBe('en');
  });

  // ── non-regression — explicit body.locale wins over the header ───────
  it('lets an explicit body.locale="fr" win over an "en-US" Accept-Language header', async () => {
    const compareImageUseCase = buildHappyUseCase();
    const app = buildApp(compareImageUseCase);

    const res = await request(app)
      .post('/chat/compare')
      .set('Authorization', `Bearer ${userToken()}`)
      .set('Accept-Language', 'en-US')
      .field('sessionId', VALID_SESSION_ID)
      .field('topK', '5')
      .field('locale', 'fr')
      .attach('image', imageBuffer, { filename: 'fixture.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(forwardedLocale(compareImageUseCase)).toBe('fr');
  });

  // ── non-regression — no header + no body.locale → DEFAULT ('en') ─────
  it('falls back to the default locale "en" when neither header nor body.locale is present', async () => {
    const compareImageUseCase = buildHappyUseCase();
    const app = buildApp(compareImageUseCase);

    const res = await request(app)
      .post('/chat/compare')
      .set('Authorization', `Bearer ${userToken()}`)
      .field('sessionId', VALID_SESSION_ID)
      .field('topK', '5')
      .attach('image', imageBuffer, { filename: 'fixture.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(forwardedLocale(compareImageUseCase)).toBe('en');
  });

  // ── unknown region tag → DEFAULT ('en') ──────────────────────────────
  it('falls back to "en" for an unsupported Accept-Language tag "pt-BR"', async () => {
    const compareImageUseCase = buildHappyUseCase();
    const app = buildApp(compareImageUseCase);

    const res = await request(app)
      .post('/chat/compare')
      .set('Authorization', `Bearer ${userToken()}`)
      .set('Accept-Language', 'pt-BR')
      .field('sessionId', VALID_SESSION_ID)
      .field('topK', '5')
      .attach('image', imageBuffer, { filename: 'fixture.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(forwardedLocale(compareImageUseCase)).toBe('en');
  });
});
