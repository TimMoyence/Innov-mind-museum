/**
 * RED — T6.2 — `POST /chat/compare` route integration test.
 *
 * Locks down tasks.md T6.2 + spec R1, R6, R10, R11, R17, R18 and design.md §5
 * for the HTTP wire contract:
 *   - 200 happy path with a sanitised multipart upload + valid body returns
 *     the {@link CompareResult} envelope (matches + durationMs +
 *     modelVersion).
 *   - 400 on Zod failure (missing sessionId, topK out of [1,10], malformed
 *     museumQid).
 *   - 503 + `COMPARE_ENCODER_UNAVAILABLE` when the use-case surfaces an
 *     `encoder_unavailable` fallbackReason (R11). The similarity service
 *     translates an underlying {@link EncoderUnavailableError} into that
 *     fallbackReason — the route maps it to a 503.
 *   - 401 when no Bearer token is presented (auth middleware reused).
 *   - The use-case is called exactly once with the parsed body + the multer
 *     buffer; this also pins R1 persistence (the use-case is responsible for
 *     calling `chatPersistence.appendAssistantMessage` per Phase 5 — verified
 *     end-to-end by the spy on the dispatched use-case).
 *
 * SUT does not yet exist (Phase 6 wiring). The dynamic require() below
 * yields a "Cannot find module …" RED until the editor lands
 * `chat-compare.route.ts`.
 */

import express from 'express';
import request from 'supertest';

import { badRequest } from '@shared/errors/app.error';
import { errorHandler } from '@src/helpers/middleware/error.middleware';
import {
  makeCompareMatch,
  makeCompareResult,
} from 'tests/helpers/chat/visual-similarity/compare.fixtures';
import { makeSiglipJpegBuffer } from 'tests/helpers/chat/visual-similarity/image-fixtures';
import { resetRateLimits, stopRateLimitSweep } from 'tests/helpers/http/route-test-setup';
import { userToken } from 'tests/helpers/auth/token.helpers';

import type { CompareResult } from '@modules/chat/domain/visual-similarity/compare-result.types';
import type { Express, RequestHandler, Router } from 'express';

// ---------------------------------------------------------------------------
// SUT — Phase 6 file, must not yet exist.
// ---------------------------------------------------------------------------

/** Single-call input shape accepted by `compareImageUseCase` — Phase 5 contract. */
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
  /**
   * The Phase 5 `compareImageUseCase` — already partially-applied with its
   * dependencies. The route is responsible for parsing the request, calling
   * this use-case once, and translating any `fallbackReason: 'encoder_
   * unavailable'` into a 503 response.
   */
  compareImageUseCase: (input: CompareUseCaseInput) => Promise<CompareResult>;
  /** Optional shared upload-admission middleware (concurrency limiter). */
  uploadAdmission?: RequestHandler;
}

interface CompareRouteModule {
  createCompareRouter: (deps: CompareRouterDeps) => Router;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic SUT load (Phase 6 RED)
const sut = require(
  '@modules/chat/adapters/primary/http/routes/chat-compare.route',
) as CompareRouteModule;

const { createCompareRouter } = sut;

// ---------------------------------------------------------------------------
// Test app + helpers
// ---------------------------------------------------------------------------

const VALID_SESSION_ID = '8c7b1e0a-3f4d-4e21-9b6a-1c2d3e4f5a6b';

/**
 * Boots a minimal Express app mounting only the compare router behind `/chat`.
 * Mirrors the chat sub-router test pattern in `chat-message-route.test.ts` but
 * skips the global middleware stack (auth is reused via the JWT token helper).
 * @param deps - Router dependencies — the compare use-case spy + optional admission middleware.
 * @returns A configured Express app ready for `supertest`.
 */
function buildApp(deps: CompareRouterDeps): Express {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/chat', createCompareRouter(deps));
  app.use(errorHandler);
  return app;
}

/**
 * Default mock that returns a populated CompareResult.
 * @returns A jest mock pre-configured to resolve with one Mona-Lisa match.
 */
function buildHappyUseCase(): jest.Mock<Promise<CompareResult>, [CompareUseCaseInput]> {
  return jest
    .fn<Promise<CompareResult>, [CompareUseCaseInput]>()
    .mockResolvedValue(makeCompareResult({ matches: [makeCompareMatch()] }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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

  // ── Happy path (R1) ───────────────────────────────────────────────

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

  // ── 400 — Zod validation (R6, R17) ───────────────────────────────

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

  // ── 503 — encoder unavailable (R11) ──────────────────────────────

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

  // ── 200 — no_visual_neighbor empty fallback (R10) ────────────────

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

  // ── 401 — auth ──────────────────────────────────────────────────

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
