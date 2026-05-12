/**
 * T6.2 — `POST /chat/compare` route handler.
 *
 * Wires the multipart upload + body validation around the Phase 5
 * {@link compareImageUseCase} and translates the use-case envelope into the
 * HTTP wire contract pinned by `compare.route.test.ts`:
 *   - 200 + {@link CompareResult} on the happy path (R1).
 *   - 400 + `COMPARE_INVALID_IMAGE` when the upload is missing or rejected
 *     by the shared image processor (R6 / R12 / multer field cap).
 *   - 400 + `COMPARE_INVALID_TOPK` when the `topK` field falls outside `[1,10]`
 *     (R17). Other Zod failures flow through with the generic `BAD_REQUEST`
 *     code so the wire contract stays narrowly scoped (design.md §5).
 *   - 400 + `COMPARE_GUARDRAIL_BLOCKED` when the OCR / prompt-injection
 *     guardrail in `ImageProcessingService` rejects the buffer (R18).
 *   - 401 on missing / invalid Bearer token (auth middleware reused).
 *   - 503 + `COMPARE_ENCODER_UNAVAILABLE` when the use-case surfaces an
 *     `encoder_unavailable` fallbackReason (R11). Other fallback reasons
 *     (`no_visual_neighbor`, `quota_exceeded`) flow through with status 200
 *     and the empty `matches` array — the FE renders a fallback UX.
 *
 * The route is mounted from the chat composition root (Phase 6 / T6.3) —
 * we do NOT touch `chat.route.ts` here.
 */
import { Router } from 'express';

import { upload } from '@modules/chat/adapters/primary/http/helpers/chat-route.helpers';
import { compareRequestSchema } from '@modules/chat/adapters/primary/http/schemas/compare.schemas';
import {
  AppError,
  badRequest,
  compareGuardrailBlocked,
  compareInvalidImage,
  compareInvalidTopK,
} from '@shared/errors/app.error';
import { formatZodIssues } from '@shared/validation/zod-issue.formatter';
import { env } from '@src/config/env';
import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';
import { dailyChatLimit } from '@src/helpers/middleware/daily-chat-limit.middleware';
import {
  bySession,
  byUserId,
  createRateLimitMiddleware,
} from '@src/helpers/middleware/rate-limit.middleware';

import type { CompareResult } from '@modules/chat/domain/visual-similarity/compare-result.types';
import type { Request, Response, RequestHandler } from 'express';
import type { z } from 'zod';

/**
 * Single-call input shape accepted by `compareImageUseCase` — Phase 5 contract.
 *
 * Mirrored locally rather than imported from `compare.use-case.ts` because the
 * route only depends on the structural shape of the input. Keeping this type
 * here means `chat-compare.route.ts` does not pull the use-case module
 * (which transitively imports the similarity service factory) into the
 * route's compile graph — handy when the route is mounted in isolation by
 * the integration test harness.
 */
interface CompareUseCaseInput {
  sessionId: string;
  buffer: Buffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  topK: number;
  locale: 'fr' | 'en';
  museumQids?: string[];
  ownerId?: number;
}

/** Constructor dependencies for {@link createCompareRouter}. */
export interface CompareRouterDeps {
  /**
   * The Phase 5 `compareImageUseCase` — already partially-applied with its
   * dependencies. The route is responsible for parsing the request, calling
   * this use-case once, and translating any
   * `fallbackReason: 'encoder_unavailable'` into a 503 response.
   */
  compareImageUseCase: (input: CompareUseCaseInput) => Promise<CompareResult>;
  /** Optional shared upload-admission middleware (concurrency limiter). */
  uploadAdmission?: RequestHandler;
  /**
   * Verify that the authenticated user owns the target chat session BEFORE the
   * use-case runs. Mirrors the `ensureSessionAccess()` invariant on every other
   * chat write path (`chat-session.service.ts:170,291`). Wired by the
   * composition root from the chat repository; throws `404 Chat session not
   * found` on UUID parse failure or ownership mismatch (parity with the rest
   * of the chat surface). Required field — making it optional invites the
   * exact cross-tenant write bug the security review surfaced
   * (2026-05-10 BLOCKER).
   */
  verifySessionAccess: (sessionId: string, ownerId: number | undefined) => Promise<void>;
}

/**
 * Default locale used by the route when neither the body nor the
 * `Accept-Language` resolution carries one. Matches the chat module default.
 */
const DEFAULT_LOCALE: 'fr' | 'en' = 'en';

/**
 * Coerces a `'fr' | 'en' | undefined` body locale into the resolved locale.
 *
 * Resolution order:
 *   1. The body field, when present (already validated by the Zod enum).
 *   2. `req.clientLocale` when it is one of the supported values (set by
 *      the global `accept-language` middleware on production, absent on the
 *      isolated integration-test app).
 *   3. {@link DEFAULT_LOCALE}.
 */
function resolveLocale(
  bodyLocale: 'fr' | 'en' | undefined,
  req: Request,
): 'fr' | 'en' {
  if (bodyLocale) return bodyLocale;
  const clientLocale = req.clientLocale;
  if (clientLocale === 'fr' || clientLocale === 'en') return clientLocale;
  return DEFAULT_LOCALE;
}

/**
 * Coerces an existing `museumQids` body value into an array — used by
 * {@link normaliseMuseumQids} when both `museumQids` and `museumQids[]`
 * appear on the same multipart payload (defensive: not seen in production
 * clients, but the merge keeps the implementation tolerant).
 */
function resolveExistingMuseumQids(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === undefined) return [];
  return [value];
}

/**
 * Normalises array-style multipart field names (`museumQids[]`) into the
 * shape the body schema expects (`museumQids: string[]`).
 *
 * Rationale: when supertest / a browser submits `multipart/form-data` with a
 * repeated field via `museumQids[]`, multer parses each occurrence into
 * `req.body['museumQids[]']` (literal key, since the bracket syntax is a
 * URL-encoded convention multer does not honour by default). Without this
 * normalisation, the schema would never see the list and the malformed-QID
 * test case in `compare.route.test.ts` would falsely pass validation.
 *
 * The normalisation is local to this route and intentionally narrow — only
 * `museumQids[]` is rewritten — so it does not interfere with other multipart
 * routes in the chat module.
 */
function normaliseMuseumQids(body: Record<string, unknown>): Record<string, unknown> {
  // Phase 6 corrective I2 — destructure the literal `museumQids[]` field with
  // a rename + collect the rest into a fresh object. This drops the bracket
  // key from the output WITHOUT a dynamic `delete` (no eslint-disable needed)
  // and is byte-equivalent to the previous spread + delete sequence.
  const { 'museumQids[]': bracketField, ...rest } = body;
  if (bracketField === undefined) return body;

  const list = Array.isArray(bracketField) ? bracketField : [bracketField];
  const existing = resolveExistingMuseumQids(rest.museumQids);
  return { ...rest, museumQids: [...existing, ...list] };
}

/**
 * Heuristic — does this Zod failure imply the `topK` field is out of range?
 *
 * Returns true when EVERY issue in the failure path is rooted at `topK`. We
 * check the full path stack (not just `[0]`) so a multi-issue failure where
 * any non-topK field also failed degrades back to the generic `BAD_REQUEST`
 * code — keeping the wire contract scoped to `COMPARE_INVALID_TOPK` only when
 * topK is the SOLE cause (design.md §5).
 */
function isTopKOnlyZodFailure(issues: readonly z.core.$ZodIssue[]): boolean {
  if (issues.length === 0) return false;
  return issues.every((issue) => issue.path[0] === 'topK');
}

/**
 * Map an error thrown by the use-case (or any of its collaborators — the
 * shared `ImageProcessingService` in particular) to a route-level
 * compare-specific error code. The shared image processor throws plain
 * `AppError` instances with `code: 'BAD_REQUEST'`; the route is the
 * authoritative boundary for the FE-facing taxonomy, so we re-emit these as
 * `COMPARE_INVALID_IMAGE` or `COMPARE_GUARDRAIL_BLOCKED` based on the
 * message verbatim ("Image contains disallowed content" is the OCR
 * guardrail signature in `image-processing.service.ts:193`).
 *
 * Errors that don't match the BAD_REQUEST shape (e.g. 503 from the
 * underlying encoder) bubble through unchanged so the global error
 * middleware preserves their status + code.
 */
function mapUseCaseError(error: unknown): unknown {
  if (!(error instanceof AppError)) return error;
  if (error.statusCode !== 400 || error.code !== 'BAD_REQUEST') return error;

  if (error.message === 'Image contains disallowed content') {
    return compareGuardrailBlocked(error.message, error.details);
  }
  return compareInvalidImage(error.message, error.details);
}

/**
 * Express handler factory for `POST /chat/compare`.
 *
 * Performs body validation (Zod) + image presence check (multer) + use-case
 * invocation + 503 fallbackReason mapping. Auth + multer middleware are
 * mounted by {@link createCompareRouter} below.
 */
function createCompareHandler(deps: CompareRouterDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      throw compareInvalidImage('image file is required');
    }

    const normalisedBody = normaliseMuseumQids(
      (req.body ?? {}) as Record<string, unknown>,
    );
    const parsed = compareRequestSchema.safeParse(normalisedBody);
    if (!parsed.success) {
      const issues = parsed.error.issues;
      const formatted = formatZodIssues(issues);
      // R17 — when the failure is exclusively on `topK`, surface the dedicated
      // `COMPARE_INVALID_TOPK` code so FE clients can branch on it. Other
      // body-shape failures keep the generic `BAD_REQUEST` code (design.md §5).
      if (isTopKOnlyZodFailure(issues)) {
        throw compareInvalidTopK(formatted, issues);
      }
      throw badRequest(formatted);
    }

    const body = parsed.data;
    const locale = resolveLocale(body.locale, req);
    const ownerId = req.user?.id;

    // Authorization — verify the authenticated user owns the target session.
    // Mirrors `ensureSessionAccess()` on every other chat write path. Throws
    // 400 (bad UUID) or 404 (not found / not owned) — parity with the rest of
    // the chat surface (security BLOCKER 2026-05-10: without this guard,
    // user A could append assistant messages to user B's session).
    await deps.verifySessionAccess(body.sessionId, ownerId);

    const mimeType = req.file.mimetype as CompareUseCaseInput['mimeType'];

    const useCaseInput: CompareUseCaseInput = {
      sessionId: body.sessionId,
      buffer: req.file.buffer,
      mimeType,
      topK: body.topK,
      locale,
      ...(body.museumQids !== undefined ? { museumQids: body.museumQids } : {}),
      ...(ownerId !== undefined ? { ownerId } : {}),
    };

    let result: CompareResult;
    try {
      result = await deps.compareImageUseCase(useCaseInput);
    } catch (error) {
      throw mapUseCaseError(error);
    }

    if (result.fallbackReason === 'encoder_unavailable') {
      throw new AppError({
        message: 'Visual similarity encoder is temporarily unavailable',
        statusCode: 503,
        code: 'COMPARE_ENCODER_UNAVAILABLE',
        details: result,
      });
    }

    res.status(200).json(result);
  };
}

/**
 * Creates the compare sub-router: `POST /compare`.
 *
 * Mounted at `/chat` by the composition root so the public path becomes
 * `POST /chat/compare`. Mirrors the chat-message + chat-media route
 * factories: auth → optional upload admission → multer single-file → handler.
 *
 * @param deps - Router dependencies — the compare use-case + optional admission middleware.
 * @returns Router handling `POST /compare`.
 */
export const createCompareRouter = (deps: CompareRouterDeps): Router => {
  const router = Router();

  // Rate limiting — mirrors `chat-message.route.ts:168-191`. Compare is
  // encoder + DB + Wikidata-bound (much more expensive than a plain message),
  // so reusing the same per-user / per-session windows is a reasonable
  // floor. Stricter compare-specific limits are a follow-up if the
  // production traffic profile warrants. Without these, an authenticated
  // attacker could hammer the route at line speed (security BLOCKER
  // 2026-05-10: cache thrashing + encoder saturation).
  const sessionLimiter = createRateLimitMiddleware({
    limit: env.rateLimit.sessionLimit,
    windowMs: env.rateLimit.windowMs,
    keyGenerator: bySession,
  });
  const userLimiter = createRateLimitMiddleware({
    limit: env.rateLimit.userLimit,
    windowMs: env.rateLimit.windowMs,
    keyGenerator: byUserId,
  });

  router.post(
    '/compare',
    isAuthenticated,
    dailyChatLimit,
    userLimiter,
    sessionLimiter,
    ...(deps.uploadAdmission ? [deps.uploadAdmission] : []),
    upload.single('image'),
    createCompareHandler(deps),
  );

  return router;
};
