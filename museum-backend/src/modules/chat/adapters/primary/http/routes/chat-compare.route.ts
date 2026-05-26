/**
 * T6.2 — `POST /chat/compare` route handler.
 *
 * Wire contract (pinned by `compare.route.test.ts`):
 *   - 200 + CompareResult (R1)
 *   - 400 COMPARE_INVALID_IMAGE — missing/rejected upload (R6/R12)
 *   - 400 COMPARE_INVALID_TOPK — topK ∉ [1,10] AND sole failure (R17)
 *   - 400 COMPARE_GUARDRAIL_BLOCKED — OCR/injection guardrail (R18)
 *   - 401 — missing/invalid Bearer
 *   - 503 COMPARE_ENCODER_UNAVAILABLE — fallbackReason='encoder_unavailable' (R11)
 *   Other fallback reasons (no_visual_neighbor, quota_exceeded) return 200 + empty matches.
 */
import { Router } from 'express';

import { getRequestUser, upload } from '@modules/chat/adapters/primary/http/helpers/chat-route.helpers';
import { compareRequestSchema } from '@modules/chat/adapters/primary/http/schemas/compare.schemas';
import { resolveActiveProviderForScope } from '@modules/chat/useCase/orchestration/provider-resolver';
import { buildThirdPartyAiConsentChecker } from '@modules/chat/useCase/third-party-ai-consent-checker';
import {
  AppError,
  badRequest,
  compareGuardrailBlocked,
  compareInvalidImage,
  compareInvalidTopK,
} from '@shared/errors/app.error';
import { isAuthenticated } from '@shared/middleware/authenticated.middleware';
import { dailyChatLimit } from '@shared/middleware/daily-chat-limit.middleware';
import {
  bySession,
  byUserId,
  createRateLimitMiddleware,
} from '@shared/middleware/rate-limit.middleware';
import { formatZodIssues } from '@shared/validation/zod-issue.formatter';
import { env } from '@src/config/env';

import type { CompareResult } from '@modules/chat/domain/visual-similarity/compare-result.types';
import type { ThirdPartyAiConsentChecker } from '@modules/chat/useCase/third-party-ai-consent-checker';
import type { Request, Response, RequestHandler } from 'express';
import type { z } from 'zod';

/**
 * Mirrored locally (not imported from compare.use-case.ts) to keep the route's
 * compile graph free of the similarity-service factory — needed when the
 * integration test harness mounts the route in isolation.
 */
interface CompareUseCaseInput {
  sessionId: string;
  buffer: Buffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  topK: number;
  locale: 'fr' | 'en';
  museumQids?: string[];
  /** OWASP LLM08 — resolved from `ChatSession.museumId` by the route. */
  museumId?: number | null;
  ownerId?: number;
}

export interface CompareRouterDeps {
  compareImageUseCase: (input: CompareUseCaseInput) => Promise<CompareResult>;
  uploadAdmission?: RequestHandler;
  /**
   * SEC: Required (not optional) — mirrors ensureSessionAccess() on every chat
   * write path. Throws 404 on UUID parse failure / ownership mismatch. Without
   * this, user A could append to user B's session (BLOCKER 2026-05-10).
   *
   * OWASP LLM08: returned museumId is the internal tenant axis. `null` for
   * B2C anonymous / V1 single-tenant; positive int once B2B onboarding pins
   * the session. Forwarded 1:1 to the kNN search at repo layer to scope rows
   * to `museum_id IS NULL OR museum_id = $tenantId`.
   */
  verifySessionAccess: (
    sessionId: string,
    ownerId: number | undefined,
  ) => Promise<{ museumId: number | null }>;
  /**
   * B-03 (GDPR Art. 7) — third-party AI image-share consent gate, parity with
   * STT (`chat-media.route.ts`) and describe (`chat-describe.route.ts`). Injectable
   * for tests; defaults to the production `buildThirdPartyAiConsentChecker()`.
   */
  consentChecker?: ThirdPartyAiConsentChecker;
}

const DEFAULT_LOCALE: 'fr' | 'en' = 'en';

/** Resolution order: body field → req.clientLocale → DEFAULT_LOCALE. */
function resolveLocale(bodyLocale: 'fr' | 'en' | undefined, req: Request): 'fr' | 'en' {
  if (bodyLocale) return bodyLocale;
  const clientLocale = req.clientLocale;
  if (clientLocale === 'fr' || clientLocale === 'en') return clientLocale;
  return DEFAULT_LOCALE;
}

function resolveExistingMuseumQids(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === undefined) return [];
  return [value];
}

/**
 * Multer parses repeated `museumQids[]` multipart fields into the literal
 * `req.body['museumQids[]']` key (bracket syntax not honoured by default).
 * Rewrites that into `museumQids: string[]` so the Zod schema sees it.
 * Narrowly scoped — only `museumQids[]` is rewritten.
 */
function normaliseMuseumQids(body: Record<string, unknown>): Record<string, unknown> {
  // Destructure rename avoids dynamic `delete` (no eslint-disable needed).
  const { 'museumQids[]': bracketField, ...rest } = body;
  if (bracketField === undefined) return body;

  const list = Array.isArray(bracketField) ? bracketField : [bracketField];
  const existing = resolveExistingMuseumQids(rest.museumQids);
  return { ...rest, museumQids: [...existing, ...list] };
}

/**
 * True iff EVERY issue is rooted at `topK` — keeps COMPARE_INVALID_TOPK
 * scoped to topK-sole failures (design.md §5); multi-field failures degrade
 * to generic BAD_REQUEST.
 */
function isTopKOnlyZodFailure(issues: readonly z.core.$ZodIssue[]): boolean {
  if (issues.length === 0) return false;
  return issues.every((issue) => issue.path[0] === 'topK');
}

/**
 * Re-emit shared ImageProcessingService BAD_REQUEST errors as the FE-facing
 * COMPARE_* taxonomy. Non-BAD_REQUEST errors (e.g. 503 encoder) bubble through
 * unchanged. "Image contains disallowed content" is the OCR guardrail
 * signature (image-processing.service.ts:193).
 */
function mapUseCaseError(error: unknown): unknown {
  if (!(error instanceof AppError)) return error;
  if (error.statusCode !== 400 || error.code !== 'BAD_REQUEST') return error;

  if (error.message === 'Image contains disallowed content') {
    return compareGuardrailBlocked(error.message, error.details);
  }
  return compareInvalidImage(error.message, error.details);
}

function createCompareHandler(
  deps: CompareRouterDeps,
  consentChecker: ThirdPartyAiConsentChecker,
) {
  return async (req: Request, res: Response): Promise<void> => {
    // B-03 (GDPR Art. 7) — gate the third-party AI image-share scope FIRST, in
    // the handler head: short-circuits BEFORE `verifySessionAccess` and the
    // use-case so a denied photo never reaches the SigLIP encoder. Read-only,
    // runs after auth (401 for anon) → no mutating-middleware regress. Parity
    // with STT / describe gates.
    const { scope } = resolveActiveProviderForScope('image');
    const granted = await consentChecker.isGranted(getRequestUser(req)?.id, scope);
    if (!granted) {
      res.status(403).json({ error: 'consent_required', scope });
      return;
    }

    if (!req.file) {
      throw compareInvalidImage('image file is required');
    }

    const normalisedBody = normaliseMuseumQids((req.body ?? {}) as Record<string, unknown>);
    const parsed = compareRequestSchema.safeParse(normalisedBody);
    if (!parsed.success) {
      const issues = parsed.error.issues;
      const formatted = formatZodIssues(issues);
      // R17 / design.md §5 — topK-only failures get the dedicated code.
      if (isTopKOnlyZodFailure(issues)) {
        throw compareInvalidTopK(formatted, issues);
      }
      throw badRequest(formatted);
    }

    const body = parsed.data;
    const locale = resolveLocale(body.locale, req);
    const ownerId = req.user?.id;

    // SEC BLOCKER 2026-05-10 — verify session ownership; without this, user A
    // could append to user B's session. Returns museumId (OWASP LLM08 tenant
    // axis) for kNN scoping.
    const { museumId: sessionMuseumId } = await deps.verifySessionAccess(body.sessionId, ownerId);

    const mimeType = req.file.mimetype as CompareUseCaseInput['mimeType'];

    const useCaseInput: CompareUseCaseInput = {
      sessionId: body.sessionId,
      buffer: req.file.buffer,
      mimeType,
      topK: body.topK,
      locale,
      ...(body.museumQids !== undefined ? { museumQids: body.museumQids } : {}),
      // OWASP LLM08 — only set when pinned to a tenant; null B2C sessions
      // fall back to legacy global read at the repo.
      ...(sessionMuseumId !== null ? { museumId: sessionMuseumId } : {}),
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
 * Mounted at `/chat` by composition root → public path `POST /chat/compare`.
 * Middleware order: auth → admission → multer single-file → handler.
 */
export const createCompareRouter = (deps: CompareRouterDeps): Router => {
  const router = Router();

  // B-03 — default to the production checker (parity `createMediaRouter` /
  // `createDescribeRouter`); tests inject an override via `deps.consentChecker`.
  const consentChecker = deps.consentChecker ?? buildThirdPartyAiConsentChecker();

  // SEC BLOCKER 2026-05-10 — without limiters an authenticated attacker can
  // hammer (cache thrashing + encoder saturation). Mirrors chat-message.route
  // windows; compare-specific tightening is a follow-up.
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
    createCompareHandler(deps, consentChecker),
  );

  return router;
};
