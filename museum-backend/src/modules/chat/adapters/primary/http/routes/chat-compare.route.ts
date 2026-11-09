import { Router } from 'express';

import {
  getRequestUser,
  upload,
} from '@modules/chat/adapters/primary/http/helpers/chat-route.helpers';
import { compareRequestSchema } from '@modules/chat/adapters/primary/http/schemas/compare.schemas';
import { resolveActiveProviderForScope } from '@modules/chat/useCase/orchestration/provider-resolver';
import { buildThirdPartyAiConsentChecker } from '@modules/chat/useCase/third-party-ai-consent-checker';
import {
  AppError,
  compareGuardrailBlocked,
  compareInvalidImage,
  compareInvalidTopK,
  invalidInput,
} from '@shared/errors/app.error';
import { extractLangCode } from '@shared/i18n/locale';
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

interface CompareUseCaseInput {
  sessionId: string;
  buffer: Buffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  topK: number;
  locale: 'fr' | 'en';
  museumQids?: string[];
  museumId?: number | null;
  ownerId?: number;
}

export interface CompareRouterDeps {
  compareImageUseCase: (input: CompareUseCaseInput) => Promise<CompareResult>;
  uploadAdmission?: RequestHandler;
  verifySessionAccess: (
    sessionId: string,
    ownerId: number | undefined,
  ) => Promise<{ museumId: number | null }>;
  consentChecker?: ThirdPartyAiConsentChecker;
}

const DEFAULT_LOCALE: 'fr' | 'en' = 'en';

function resolveLocale(bodyLocale: 'fr' | 'en' | undefined, req: Request): 'fr' | 'en' {
  for (const candidate of [bodyLocale, req.clientLocale]) {
    if (!candidate) continue;
    const code = extractLangCode(candidate);
    if (code === 'fr' || code === 'en') return code;
  }
  return DEFAULT_LOCALE;
}

function resolveExistingMuseumQids(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === undefined) return [];
  return [value];
}

function normaliseMuseumQids(body: Record<string, unknown>): Record<string, unknown> {
  const { 'museumQids[]': bracketField, ...rest } = body;
  if (bracketField === undefined) return body;

  const list = Array.isArray(bracketField) ? bracketField : [bracketField];
  const existing = resolveExistingMuseumQids(rest.museumQids);
  return { ...rest, museumQids: [...existing, ...list] };
}

function isTopKOnlyZodFailure(issues: readonly z.core.$ZodIssue[]): boolean {
  if (issues.length === 0) return false;
  return issues.every((issue) => issue.path[0] === 'topK');
}

function mapUseCaseError(error: unknown): unknown {
  if (!(error instanceof AppError)) return error;
  if (error.statusCode !== 400 || error.code !== 'BAD_REQUEST') return error;

  if (error.message === 'Image contains disallowed content') {
    return compareGuardrailBlocked(error.message, error.details);
  }
  return compareInvalidImage(error.message, error.details, error.inputRejected);
}

function createCompareHandler(deps: CompareRouterDeps, consentChecker: ThirdPartyAiConsentChecker) {
  return async (req: Request, res: Response): Promise<void> => {
    const { scope } = resolveActiveProviderForScope('image');
    const granted = await consentChecker.isGranted(getRequestUser(req)?.id, scope);
    if (!granted) {
      res.status(403).json({ error: 'consent_required', scope });
      return;
    }

    if (!req.file) {
      throw compareInvalidImage('image file is required', undefined, true);
    }

    const normalisedBody = normaliseMuseumQids((req.body ?? {}) as Record<string, unknown>);
    const parsed = compareRequestSchema.safeParse(normalisedBody);
    if (!parsed.success) {
      const issues = parsed.error.issues;
      const formatted = formatZodIssues(issues);
      if (isTopKOnlyZodFailure(issues)) {
        throw compareInvalidTopK(formatted, issues);
      }
      throw invalidInput(formatted);
    }

    const body = parsed.data;
    const locale = resolveLocale(body.locale, req);
    const ownerId = req.user?.id;

    const { museumId: sessionMuseumId } = await deps.verifySessionAccess(body.sessionId, ownerId);

    const mimeType = req.file.mimetype as CompareUseCaseInput['mimeType'];

    const useCaseInput: CompareUseCaseInput = {
      sessionId: body.sessionId,
      buffer: req.file.buffer,
      mimeType,
      topK: body.topK,
      locale,
      ...(body.museumQids !== undefined ? { museumQids: body.museumQids } : {}),
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

export const createCompareRouter = (deps: CompareRouterDeps): Router => {
  const router = Router();

  const consentChecker = deps.consentChecker ?? buildThirdPartyAiConsentChecker();

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
