import { Router } from 'express';
import { z } from 'zod';

import { getRequestUser } from '@modules/chat/adapters/primary/http/helpers/chat-route.helpers';
import { resolveActiveProviderForScope } from '@modules/chat/useCase/orchestration/provider-resolver';
import { buildThirdPartyAiConsentChecker } from '@modules/chat/useCase/third-party-ai-consent-checker';
import { badRequest } from '@shared/errors/app.error';
import { isAuthenticated } from '@shared/middleware/authenticated.middleware';
import { llmCostGuard } from '@shared/middleware/llm-cost-guard.middleware';
import { byUserId, createRateLimitMiddleware } from '@shared/middleware/rate-limit.middleware';

import type { ConsentScope } from '@modules/auth/domain/consent/userConsent.entity';
import type { DescribeService } from '@modules/chat/useCase/describe.service';
import type { ThirdPartyAiConsentChecker } from '@modules/chat/useCase/third-party-ai-consent-checker';
import type { Request, Response } from 'express';

const describeInputSchema = z.object({
  image: z
    .object({
      source: z.enum(['base64', 'url']),
      value: z.string().min(1),
      mimeType: z.string().optional(),
    })
    .optional(),
  text: z.string().max(2000).optional(),
  locale: z.string().max(10).default('en'),
  guideLevel: z.enum(['beginner', 'intermediate', 'expert']).default('beginner'),
  format: z.enum(['text', 'audio', 'both']).default('text'),
});

type DescribeInput = z.infer<typeof describeInputSchema>;

/**
 * B-02 — every third-party AI scope this request will exercise. text → LLM text
 * scope, image → LLM image scope, format audio|both → OpenAI TTS audio scope
 * (AND-intersection, parity with consent-gate.ts Q2).
 */
const requiredConsentScopes = (input: DescribeInput): ConsentScope[] => {
  const scopes: ConsentScope[] = [];
  if (input.text) {
    scopes.push(resolveActiveProviderForScope('text').scope);
  }
  if (input.image) {
    scopes.push(resolveActiveProviderForScope('image').scope);
  }
  if (input.format === 'audio' || input.format === 'both') {
    scopes.push(resolveActiveProviderForScope('audio').scope);
  }
  return scopes;
};

export const createDescribeRouter = (
  describeService: DescribeService,
  consentChecker: ThirdPartyAiConsentChecker = buildThirdPartyAiConsentChecker(),
): Router => {
  const router = Router();

  const describeLimiter = createRateLimitMiddleware({
    limit: 30,
    windowMs: 60_000,
    keyGenerator: byUserId,
  });

  router.post(
    '/describe',
    isAuthenticated,
    describeLimiter,
    // P0-4 — kill-switch + per-user daily USD cap. Single chokepoint gates LLM + TTS.
    llmCostGuard,
    async (req: Request, res: Response) => {
      const parsed = describeInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest(parsed.error.issues.map((i) => i.message).join('; '));
      }

      const input = parsed.data;
      if (!input.text && !input.image) {
        throw badRequest('Either text or image is required');
      }

      // B-02 (R6/R7/R8/R10) — gate every third-party AI call this endpoint can
      // trigger BEFORE entering the service (AND-intersection: first denied
      // scope short-circuits). Read-only, runs after auth + validators → no
      // mutating-middleware regress.
      const currentUser = getRequestUser(req);
      for (const scope of requiredConsentScopes(input)) {
        const granted = await consentChecker.isGranted(currentUser?.id, scope);
        if (!granted) {
          res.status(403).json({ error: 'consent_required', scope });
          return;
        }
      }

      const result = await describeService.describe({
        text: input.text,
        image: input.image,
        locale: input.locale,
        guideLevel: input.guideLevel,
        format: input.format,
      });

      if (input.format === 'audio' && result.audio) {
        res.set('Content-Type', result.contentType ?? 'audio/ogg');
        // nosemgrep: javascript.express.security.audit.xss.direct-response-write.direct-response-write -- binary audio Buffer from OpenAI TTS, not user-controlled HTML
        res.send(result.audio);
        return;
      }

      res.status(200).json({
        description: result.description,
        ...(input.format === 'both' && result.audio
          ? { audio: result.audio.toString('base64'), audioContentType: result.contentType }
          : {}),
        metadata: result.metadata,
      });
    },
  );

  return router;
};
