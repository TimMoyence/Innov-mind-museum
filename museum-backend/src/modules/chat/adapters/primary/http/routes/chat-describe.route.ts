import { Router } from 'express';
import { z } from 'zod';

import { badRequest } from '@shared/errors/app.error';
import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';
import { byUserId, createRateLimitMiddleware } from '@src/helpers/middleware/rate-limit.middleware';

import type { DescribeService } from '@modules/chat/useCase/describe/describe.service';
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

/**
 * Creates the describe sub-router: `POST /describe`.
 *
 * @param describeService - Injected describe service.
 * @returns Router handling the describe endpoint.
 */
export const createDescribeRouter = (describeService: DescribeService): Router => {
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
    async (req: Request, res: Response) => {
      const parsed = describeInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest(parsed.error.issues.map((i) => i.message).join('; '));
      }

      const input = parsed.data;
      if (!input.text && !input.image) {
        throw badRequest('Either text or image is required');
      }

      const result = await describeService.describe({
        text: input.text,
        image: input.image,
        locale: input.locale,
        guideLevel: input.guideLevel,
        format: input.format,
      });

      if (input.format === 'audio' && result.audio) {
        res.set('Content-Type', result.contentType ?? 'audio/mpeg');
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
