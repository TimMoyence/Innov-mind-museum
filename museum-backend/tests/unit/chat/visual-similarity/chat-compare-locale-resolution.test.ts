const grantedScopes = new Set<string>();

jest.mock('@modules/chat/useCase/third-party-ai-consent-checker', () => ({
  buildThirdPartyAiConsentChecker: () => ({
    isGranted: async (userId: number | undefined | null, scope: string) =>
      await Promise.resolve(userId !== undefined && userId !== null && grantedScopes.has(scope)),
  }),
}));

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

function buildHappyUseCase(): jest.Mock<Promise<CompareResult>, [CompareUseCaseInput]> {
  return jest
    .fn<Promise<CompareResult>, [CompareUseCaseInput]>()
    .mockResolvedValue(makeCompareResult({ matches: [makeCompareMatch()] }));
}

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
