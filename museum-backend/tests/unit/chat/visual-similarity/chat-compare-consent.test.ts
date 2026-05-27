/**
 * RED — UFR-022 phase=red, Cycle D sub-cycle D-consent (B-03),
 * RUN_ID=2026-05-26-chat-pipeline-hardening.
 *
 * Specifies the third-party AI consent gate on `POST /chat/compare`
 * (`museum-backend/src/modules/chat/adapters/primary/http/routes/chat-compare.route.ts:215-224`).
 *
 * Defect proven (B-03, HIGH — GDPR Art. 7 third-party image sharing without
 * consent): `/compare` sends the uploaded photo to the SigLIP encoder + a
 * third-party AI image pipeline yet the route runs ONLY
 * `isAuthenticated → dailyChatLimit → userLimiter → sessionLimiter →
 * upload.single → handler` — there is NO equivalent of the STT gate
 * (`chat-media.route.ts:61-71`) nor the describe gate
 * (`chat-describe.route.ts:81-92`). Same class of defect already closed on
 * STT/TTS (cycle 3, `chat-describe-consent.test.ts`).
 *
 * Acceptance shape (gate at ROUTE level, parity with describe/STT):
 *  - image scope denied → 403 `{ error: 'consent_required', scope:
 *    'third_party_ai_image_openai' }`, BEFORE `verifySessionAccess`-then-
 *    `compareImageUseCase`; the use-case is NOT invoked (no image reaches the
 *    encoder, no assistant message persisted).
 *  - image scope granted → existing 200 happy path preserved, use-case invoked
 *    once.
 *  - no token → 401 from `isAuthenticated` BEFORE the gate (coherence with
 *    STT/describe ordering); use-case not invoked.
 *  - `createCompareRouter` accepts an injectable `consentChecker` defaulting to
 *    `buildThirdPartyAiConsentChecker()` (B-03.6, parity `createMediaRouter` /
 *    `createDescribeRouter`); we mock that module here so the gate is exercised
 *    deterministically without a DB.
 *
 * RED rationale: today `createCompareRouter` does NOT consult consent at all,
 * so EVERY authenticated request reaches `compareImageUseCase` regardless of
 * scope. The 403 + "not invoked" assertions FAIL until the route-level gate
 * lands (today the denied-scope request returns 200 and invokes the use-case).
 *
 * Scope: `LLM_PROVIDER` is left at its test default → `openai`, so the image
 * dispatch channel resolves to `third_party_ai_image_openai`
 * (`provider-resolver.ts:66-70`). The image-input describe test pins the same
 * scope (`chat-describe-consent.test.ts:68`).
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
 * Boots a minimal Express app mounting only the compare router behind `/chat`.
 * Mirrors `compare.route.test.ts:buildApp` — the consent checker is supplied
 * by the jest.mock above (the router takes it as its default), so no DB is hit.
 * @param compareImageUseCase - the use-case spy (must NOT run on a denied scope).
 * @param verifySessionAccess - ownership verifier; defaults to a null-museum stub.
 * @returns A configured Express app ready for supertest.
 */
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

/**
 * Default use-case mock returning one populated match.
 * @returns A jest mock resolving with a single-match CompareResult.
 */
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

  // ── T-B03-1 — image scope denied → 403, use-case NOT invoked ──────────
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

  // ── T-B03-1b — denial short-circuits BEFORE verifySessionAccess too ───
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

  // ── T-B03-3 — image scope granted → happy path preserved ──────────────
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

  // ── T-B03-2 — anonymous (no token) → 401 BEFORE the gate ──────────────
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
