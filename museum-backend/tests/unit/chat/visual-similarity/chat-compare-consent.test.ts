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
  verifySessionAccess: (
    sessionId: string,
    ownerId: number | undefined,
  ) => Promise<{ museumId: number | null }> = async () => ({ museumId: null }),
): Express {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/chat', createCompareRouter({ compareImageUseCase, verifySessionAccess }));
  app.use(errorHandler);
  return app;
}

function buildHappyUseCase(): jest.Mock<Promise<CompareResult>, [CompareUseCaseInput]> {
  return jest
    .fn<Promise<CompareResult>, [CompareUseCaseInput]>()
    .mockResolvedValue(makeCompareResult({ matches: [makeCompareMatch()] }));
}

describe('POST /chat/compare — third-party AI image consent gate (B-03)', () => {
  let imageBuffer: Buffer;

  beforeAll(async () => {
    imageBuffer = await makeSiglipJpegBuffer();
  });

  beforeEach(() => {
    resetRateLimits();
    grantedScopes.clear();
    jest.clearAllMocks();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('returns 403 consent_required (image scope) when the image scope is not granted', async () => {
    const compareImageUseCase = buildHappyUseCase();
    const app = buildApp(compareImageUseCase);

    const res = await request(app)
      .post('/chat/compare')
      .set('Authorization', `Bearer ${userToken()}`)
      .field('sessionId', VALID_SESSION_ID)
      .field('topK', '5')
      .field('locale', 'en')
      .attach('image', imageBuffer, { filename: 'fixture.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'consent_required', scope: IMAGE_SCOPE });
    expect(compareImageUseCase).not.toHaveBeenCalled();
  });

  it('does NOT reach verifySessionAccess nor the use-case when consent is denied (no image leaks to the encoder)', async () => {
    const compareImageUseCase = buildHappyUseCase();
    const verifySessionAccess = jest.fn(async () => ({ museumId: null }));
    const app = buildApp(compareImageUseCase, verifySessionAccess);

    const res = await request(app)
      .post('/chat/compare')
      .set('Authorization', `Bearer ${userToken()}`)
      .field('sessionId', VALID_SESSION_ID)
      .field('topK', '5')
      .field('locale', 'en')
      .attach('image', imageBuffer, { filename: 'fixture.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(403);
    expect(compareImageUseCase).not.toHaveBeenCalled();
    expect(verifySessionAccess).not.toHaveBeenCalled();
  });

  it('returns 200 + CompareResult when the image scope is granted (happy path preserved)', async () => {
    grantedScopes.add(IMAGE_SCOPE);
    const compareImageUseCase = buildHappyUseCase();
    const app = buildApp(compareImageUseCase);

    const res = await request(app)
      .post('/chat/compare')
      .set('Authorization', `Bearer ${userToken()}`)
      .field('sessionId', VALID_SESSION_ID)
      .field('topK', '5')
      .field('locale', 'en')
      .attach('image', imageBuffer, { filename: 'fixture.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.matches)).toBe(true);
    expect(res.body.matches.length).toBeGreaterThan(0);
    expect(compareImageUseCase).toHaveBeenCalledTimes(1);
  });

  it('returns 401 (not 403) when no token is provided — auth runs before the gate', async () => {
    const compareImageUseCase = buildHappyUseCase();
    const app = buildApp(compareImageUseCase);

    const res = await request(app)
      .post('/chat/compare')
      .field('sessionId', VALID_SESSION_ID)
      .field('topK', '5')
      .field('locale', 'en')
      .attach('image', imageBuffer, { filename: 'fixture.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(401);
    expect(compareImageUseCase).not.toHaveBeenCalled();
  });
});
