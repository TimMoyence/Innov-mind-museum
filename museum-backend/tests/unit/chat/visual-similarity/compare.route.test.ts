const grantedScopes = new Set<string>(['third_party_ai_image_openai']);

jest.mock('@modules/chat/useCase/third-party-ai-consent-checker', () => ({
  buildThirdPartyAiConsentChecker: () => ({
    isGranted: async (userId: number | undefined | null, scope: string) =>
      await Promise.resolve(userId !== undefined && userId !== null && grantedScopes.has(scope)),
  }),
}));

import express from 'express';
import request from 'supertest';

import { badRequest } from '@shared/errors/app.error';
import { errorHandler } from '@shared/middleware/error.middleware';
import {
  makeCompareMatch,
  makeCompareResult,
} from 'tests/helpers/chat/visual-similarity/compare.fixtures';
import { makeSiglipJpegBuffer } from 'tests/helpers/chat/visual-similarity/image-fixtures';
import { resetRateLimits, stopRateLimitSweep } from 'tests/helpers/http/route-test-setup';
import { userToken } from 'tests/helpers/auth/token.helpers';

import type { CompareResult } from '@modules/chat/domain/visual-similarity/compare-result.types';
import type { Express, RequestHandler, Router } from 'express';

interface CompareUseCaseInput {
  sessionId: string;
  buffer: Buffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  topK: number;
  locale: 'fr' | 'en';
  museumQids?: string[];
  ownerId?: number;
}

interface CompareRouterDeps {
  compareImageUseCase: (input: CompareUseCaseInput) => Promise<CompareResult>;
  verifySessionAccess: (
    sessionId: string,
    ownerId: number | undefined,
  ) => Promise<{ museumId: number | null }>;
  uploadAdmission?: RequestHandler;
}

interface CompareRouteModule {
  createCompareRouter: (deps: CompareRouterDeps) => Router;
}

const sut =
  require('@modules/chat/adapters/primary/http/routes/chat-compare.route') as CompareRouteModule;

const { createCompareRouter } = sut;

const VALID_SESSION_ID = '8c7b1e0a-3f4d-4e21-9b6a-1c2d3e4f5a6b';

function buildApp(
  deps: Omit<CompareRouterDeps, 'verifySessionAccess'> & {
    verifySessionAccess?: CompareRouterDeps['verifySessionAccess'];
  },
): Express {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  const verifySessionAccess = deps.verifySessionAccess ?? (async () => ({ museumId: null }));
  app.use('/chat', createCompareRouter({ ...deps, verifySessionAccess }));
  app.use(errorHandler);
  return app;
}

function buildHappyUseCase(): jest.Mock<Promise<CompareResult>, [CompareUseCaseInput]> {
  return jest
    .fn<Promise<CompareResult>, [CompareUseCaseInput]>()
    .mockResolvedValue(makeCompareResult({ matches: [makeCompareMatch()] }));
}

describe('POST /chat/compare (T6.2 — route integration)', () => {
  let imageBuffer: Buffer;

  beforeAll(async () => {
    imageBuffer = await makeSiglipJpegBuffer();
  });

  beforeEach(() => {
    resetRateLimits();
    jest.clearAllMocks();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('200 — returns a CompareResult envelope when the use-case resolves with matches', async () => {
    const compareImageUseCase = buildHappyUseCase();
    const app = buildApp({ compareImageUseCase });

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
    expect(typeof res.body.modelVersion).toBe('string');
    expect(typeof res.body.durationMs).toBe('number');
  });

  it('SEC — invokes verifySessionAccess with the parsed sessionId + authenticated ownerId', async () => {
    const compareImageUseCase = buildHappyUseCase();
    const verifySessionAccess = jest.fn(async () => ({ museumId: null }));
    const app = buildApp({ compareImageUseCase, verifySessionAccess });

    const res = await request(app)
      .post('/chat/compare')
      .set('Authorization', `Bearer ${userToken()}`)
      .field('sessionId', VALID_SESSION_ID)
      .field('topK', '5')
      .field('locale', 'en')
      .attach('image', imageBuffer, { filename: 'fixture.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(verifySessionAccess).toHaveBeenCalledTimes(1);
    const [sessionId, ownerId] = verifySessionAccess.mock.calls[0] as unknown as [
      string,
      number | undefined,
    ];
    expect(sessionId).toBe(VALID_SESSION_ID);
    expect(typeof ownerId).toBe('number');
  });

  it('SEC — propagates 404 when verifySessionAccess throws (cross-tenant write rejected)', async () => {
    const compareImageUseCase = buildHappyUseCase();
    const { notFound } = require('@shared/errors/app.error') as {
      notFound: (msg: string) => Error;
    };
    const verifySessionAccess = jest.fn(async () => {
      throw notFound('Chat session not found');
    });
    const app = buildApp({ compareImageUseCase, verifySessionAccess });

    const res = await request(app)
      .post('/chat/compare')
      .set('Authorization', `Bearer ${userToken()}`)
      .field('sessionId', VALID_SESSION_ID)
      .field('topK', '5')
      .field('locale', 'en')
      .attach('image', imageBuffer, { filename: 'fixture.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(404);
    expect(verifySessionAccess).toHaveBeenCalledTimes(1);
    expect(compareImageUseCase).not.toHaveBeenCalled();
  });

  it('200 — calls the compareImageUseCase exactly once with the parsed body + multer buffer', async () => {
    const compareImageUseCase = buildHappyUseCase();
    const app = buildApp({ compareImageUseCase });

    await request(app)
      .post('/chat/compare')
      .set('Authorization', `Bearer ${userToken()}`)
      .field('sessionId', VALID_SESSION_ID)
      .field('topK', '5')
      .field('locale', 'fr')
      .attach('image', imageBuffer, { filename: 'fixture.jpg', contentType: 'image/jpeg' });

    expect(compareImageUseCase).toHaveBeenCalledTimes(1);
    const callArg = compareImageUseCase.mock.calls[0]?.[0];
    expect(callArg?.sessionId).toBe(VALID_SESSION_ID);
    expect(callArg?.topK).toBe(5);
    expect(callArg?.locale).toBe('fr');
    expect(Buffer.isBuffer(callArg?.buffer)).toBe(true);
    expect(callArg?.mimeType).toBe('image/jpeg');
  });

  it('400 — rejects a body missing sessionId', async () => {
    const compareImageUseCase = buildHappyUseCase();
    const app = buildApp({ compareImageUseCase });

    const res = await request(app)
      .post('/chat/compare')
      .set('Authorization', `Bearer ${userToken()}`)
      .field('topK', '5')
      .field('locale', 'en')
      .attach('image', imageBuffer, { filename: 'fixture.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expect(compareImageUseCase).not.toHaveBeenCalled();
  });

  it('R17 — 400 + COMPARE_INVALID_TOPK on topK above the upper bound (11)', async () => {
    const compareImageUseCase = buildHappyUseCase();
    const app = buildApp({ compareImageUseCase });

    const res = await request(app)
      .post('/chat/compare')
      .set('Authorization', `Bearer ${userToken()}`)
      .field('sessionId', VALID_SESSION_ID)
      .field('topK', '11')
      .field('locale', 'en')
      .attach('image', imageBuffer, { filename: 'fixture.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('COMPARE_INVALID_TOPK');
    expect(compareImageUseCase).not.toHaveBeenCalled();
  });

  it('400 — rejects a malformed museumQids entry', async () => {
    const compareImageUseCase = buildHappyUseCase();
    const app = buildApp({ compareImageUseCase });

    const res = await request(app)
      .post('/chat/compare')
      .set('Authorization', `Bearer ${userToken()}`)
      .field('sessionId', VALID_SESSION_ID)
      .field('topK', '5')
      .field('locale', 'en')
      .field('museumQids[]', 'notAQid')
      .attach('image', imageBuffer, { filename: 'fixture.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expect(compareImageUseCase).not.toHaveBeenCalled();
  });

  it('R6 — 400 + COMPARE_INVALID_IMAGE when no image file is uploaded', async () => {
    const compareImageUseCase = buildHappyUseCase();
    const app = buildApp({ compareImageUseCase });

    const res = await request(app)
      .post('/chat/compare')
      .set('Authorization', `Bearer ${userToken()}`)
      .field('sessionId', VALID_SESSION_ID)
      .field('topK', '5')
      .field('locale', 'en');

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('COMPARE_INVALID_IMAGE');
    expect(compareImageUseCase).not.toHaveBeenCalled();
  });

  it('R18 — 400 + COMPARE_GUARDRAIL_BLOCKED when the image processor rejects via the OCR/prompt-injection guardrail', async () => {
    const guardrailRejection = badRequest('Image contains disallowed content');
    const compareImageUseCase = jest
      .fn<Promise<CompareResult>, [CompareUseCaseInput]>()
      .mockRejectedValue(guardrailRejection);
    const app = buildApp({ compareImageUseCase });

    const res = await request(app)
      .post('/chat/compare')
      .set('Authorization', `Bearer ${userToken()}`)
      .field('sessionId', VALID_SESSION_ID)
      .field('topK', '5')
      .field('locale', 'en')
      .attach('image', imageBuffer, { filename: 'fixture.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('COMPARE_GUARDRAIL_BLOCKED');
    expect(compareImageUseCase).toHaveBeenCalledTimes(1);
  });

  it('R12 — 400 + COMPARE_INVALID_IMAGE when the image processor rejects on MIME / size / magic bytes', async () => {
    const imageRejection = badRequest('Uploaded image mime type is required');
    const compareImageUseCase = jest
      .fn<Promise<CompareResult>, [CompareUseCaseInput]>()
      .mockRejectedValue(imageRejection);
    const app = buildApp({ compareImageUseCase });

    const res = await request(app)
      .post('/chat/compare')
      .set('Authorization', `Bearer ${userToken()}`)
      .field('sessionId', VALID_SESSION_ID)
      .field('topK', '5')
      .field('locale', 'en')
      .attach('image', imageBuffer, { filename: 'fixture.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('COMPARE_INVALID_IMAGE');
    expect(compareImageUseCase).toHaveBeenCalledTimes(1);
  });

  it('R11 — 503 when the use-case returns fallbackReason="encoder_unavailable"', async () => {
    const compareImageUseCase = jest
      .fn<Promise<CompareResult>, [CompareUseCaseInput]>()
      .mockResolvedValue(
        makeCompareResult({
          matches: [],
          modelVersion: '',
          fallbackReason: 'encoder_unavailable',
        }),
      );
    const app = buildApp({ compareImageUseCase });

    const res = await request(app)
      .post('/chat/compare')
      .set('Authorization', `Bearer ${userToken()}`)
      .field('sessionId', VALID_SESSION_ID)
      .field('topK', '5')
      .field('locale', 'en')
      .attach('image', imageBuffer, { filename: 'fixture.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(503);
    expect(res.body.error?.code).toBe('COMPARE_ENCODER_UNAVAILABLE');
    expect(compareImageUseCase).toHaveBeenCalledTimes(1);
  });

  it('R10 — 200 with empty matches + fallbackReason="no_visual_neighbor" passes through unchanged', async () => {
    const compareImageUseCase = jest
      .fn<Promise<CompareResult>, [CompareUseCaseInput]>()
      .mockResolvedValue(
        makeCompareResult({
          matches: [],
          fallbackReason: 'no_visual_neighbor',
        }),
      );
    const app = buildApp({ compareImageUseCase });

    const res = await request(app)
      .post('/chat/compare')
      .set('Authorization', `Bearer ${userToken()}`)
      .field('sessionId', VALID_SESSION_ID)
      .field('topK', '5')
      .field('locale', 'en')
      .attach('image', imageBuffer, { filename: 'fixture.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.matches).toEqual([]);
    expect(res.body.fallbackReason).toBe('no_visual_neighbor');
  });

  it('401 — rejects requests without a Bearer token', async () => {
    const compareImageUseCase = buildHappyUseCase();
    const app = buildApp({ compareImageUseCase });

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
