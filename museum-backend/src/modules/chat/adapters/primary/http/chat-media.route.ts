import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

import { Router } from 'express';

import { badRequest } from '@shared/errors/app.error';
import { env } from '@src/config/env';
import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';
import { dailyChatLimit } from '@src/helpers/middleware/daily-chat-limit.middleware';
import {
  bySession,
  createRateLimitMiddleware,
} from '@src/helpers/middleware/rate-limit.middleware';

import {
  audioUpload,
  parseContext,
  getRequestUser,
  resolveRequestBaseUrl,
  buildImageReadUrl,
  contentTypeByExtension,
} from './chat-route.helpers';
import { parseFeedbackMessageRequest, parseReportMessageRequest } from './chat.contracts';
import { verifySignedChatImageReadUrl } from './chat.image-url';
import { isS3ImageRef } from '../../secondary/image-storage.s3';
import { resolveLocalImageFilePath } from '../../secondary/image-storage.stub';

import type { ChatService } from '../../../application/chat.service';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

/** Handler factory: POST /sessions/:id/audio */
function createAudioHandler(chatService: ChatService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const currentUser = getRequestUser(req);
      const parsedAudioContext = parseContext(req.body?.context);
      const context = {
        ...parsedAudioContext,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
        locale: parsedAudioContext?.locale || req.clientLocale,
      };

      if (!req.file) {
        throw badRequest('audio file is required');
      }

      const result = await chatService.postAudioMessage(
        req.params.id,
        {
          audio: {
            base64: req.file.buffer.toString('base64'),
            mimeType: req.file.mimetype,
            sizeBytes: req.file.size,
          },
          context,
        },
        (req as { requestId?: string }).requestId,
        currentUser?.id,
      );

      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };
}

/** Handler factory: GET /messages/:messageId/image */
function createImageServeHandler(chatService: ChatService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const verification = verifySignedChatImageReadUrl({
        messageId: req.params.messageId,
        token: typeof req.query.token === 'string' ? req.query.token : undefined,
        signature: typeof req.query.sig === 'string' ? req.query.sig : undefined,
      });

      if (!verification.ok) {
        throw badRequest(verification.reason);
      }

      const image = await chatService.getMessageImageRef(req.params.messageId);
      if (isS3ImageRef(image.imageRef)) {
        const signed = buildImageReadUrl({
          baseUrl: resolveRequestBaseUrl(req),
          messageId: req.params.messageId,
          imageRef: image.imageRef,
        });
        if (!signed) {
          throw badRequest('Unable to generate image URL for current storage backend');
        }

        res.redirect(302, signed.url);
        return;
      }

      const imagePath = resolveLocalImageFilePath(image.imageRef, env.storage.localUploadsDir);
      if (!imagePath) {
        res.status(501).json({
          error: {
            code: 'IMAGE_STORAGE_NOT_SUPPORTED',
            message: 'This image backend is not yet supported for direct read URLs.',
          },
        });
        return;
      }

      const fileStat = await stat(imagePath);
      const ext = image.fileName?.split('.').pop()?.toLowerCase() ?? '';
      const contentType =
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
        image.contentType || contentTypeByExtension[ext] || 'application/octet-stream';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', String(fileStat.size));
      res.setHeader('Cache-Control', 'private, max-age=60');

      const stream = createReadStream(imagePath);
      stream.on('error', next);
      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Creates the media sub-router (audio upload, image serving, report, TTS).
 *
 * @param chatService - Injected chat application service.
 * @param uploadAdmission - Shared upload-admission middleware (concurrency limiter).
 * @returns Router handling audio, image, report, and TTS endpoints.
 */
// eslint-disable-next-line max-lines-per-function -- route factory wires audio/image/report/TTS endpoints with shared middleware
export const createMediaRouter = (
  chatService: ChatService,
  uploadAdmission?: RequestHandler,
): Router => {
  const router = Router();

  const sessionLimiter = createRateLimitMiddleware({
    limit: env.rateLimit.sessionLimit,
    windowMs: env.rateLimit.windowMs,
    keyGenerator: bySession,
  });

  // POST /sessions/:id/audio — upload audio for transcription
  router.post(
    '/sessions/:id/audio',
    isAuthenticated,
    dailyChatLimit,
    sessionLimiter,
    ...(uploadAdmission ? [uploadAdmission] : []),
    audioUpload.single('audio'),
    createAudioHandler(chatService),
  );

  // POST /messages/:messageId/report — report a message
  router.post('/messages/:messageId/report', isAuthenticated, async (req, res, next) => {
    try {
      const currentUser = getRequestUser(req);
      if (!currentUser?.id) {
        res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Token required' },
        });
        return;
      }

      const payload = parseReportMessageRequest(req.body ?? {});
      const result = await chatService.reportMessage(
        req.params.messageId,
        payload.reason,
        currentUser.id,
        payload.comment,
      );
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  // POST /messages/:messageId/feedback — thumbs up/down
  router.post('/messages/:messageId/feedback', isAuthenticated, async (req, res, next) => {
    try {
      const currentUser = getRequestUser(req);
      if (!currentUser?.id) {
        res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Token required' },
        });
        return;
      }

      const payload = parseFeedbackMessageRequest(req.body ?? {});
      const result = await chatService.setMessageFeedback(
        req.params.messageId,
        currentUser.id,
        payload.value,
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  // POST /messages/:messageId/image-url — get signed image URL
  router.post('/messages/:messageId/image-url', isAuthenticated, async (req, res, next) => {
    try {
      const currentUser = getRequestUser(req);
      const image = await chatService.getMessageImageRef(req.params.messageId, currentUser?.id);
      const signed = buildImageReadUrl({
        baseUrl: resolveRequestBaseUrl(req),
        messageId: req.params.messageId,
        imageRef: image.imageRef,
      });
      if (!signed) {
        throw badRequest('Unable to generate image URL for current storage backend');
      }

      res.status(200).json(signed);
    } catch (error) {
      next(error);
    }
  });

  // POST /messages/:messageId/tts — text-to-speech synthesis
  router.post(
    '/messages/:messageId/tts',
    isAuthenticated,
    sessionLimiter,
    async (req, res, next) => {
      if (!env.featureFlags.voiceMode) {
        res
          .status(404)
          .json({ error: { code: 'NOT_FOUND', message: 'Voice mode is not enabled' } });
        return;
      }

      try {
        const currentUser = getRequestUser(req);
        const result = await chatService.synthesizeSpeech(req.params.messageId, currentUser?.id);

        if (!result) {
          res.status(204).end();
          return;
        }

        res.set('Content-Type', result.contentType);
        res.set('Content-Length', String(result.audio.length));
        res.send(result.audio);
      } catch (error) {
        next(error);
      }
    },
  );

  // GET /messages/:messageId/image — serve image via signed URL
  router.get('/messages/:messageId/image', createImageServeHandler(chatService));

  return router;
};
