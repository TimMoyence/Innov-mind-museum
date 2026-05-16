import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

import { Router } from 'express';

import {
  parseFeedbackMessageRequest,
  parseReportMessageRequest,
} from '@modules/chat/adapters/primary/http/chat.contracts';
import { verifySignedChatImageReadUrl } from '@modules/chat/adapters/primary/http/chat.image-url';
import {
  audioUpload,
  parseContext,
  getRequestUser,
  resolveRequestBaseUrl,
  buildImageReadUrl,
  contentTypeByExtension,
} from '@modules/chat/adapters/primary/http/helpers/chat-route.helpers';
import { isS3ImageRef } from '@modules/chat/adapters/secondary/storage/image-storage.s3';
import { resolveLocalImageFilePath } from '@modules/chat/adapters/secondary/storage/image-storage.stub';
import { AppError, badRequest } from '@shared/errors/app.error';
import { isAuthenticated } from '@shared/middleware/authenticated.middleware';
import { dailyChatLimit } from '@shared/middleware/daily-chat-limit.middleware';
import { llmCostGuard } from '@shared/middleware/llm-cost-guard.middleware';
import { parseStringParam } from '@shared/middleware/parseStringParam';
import {
  bySession,
  byUserId,
  createRateLimitMiddleware,
} from '@shared/middleware/rate-limit.middleware';
import { env } from '@src/config/env';

import type { ChatService } from '@modules/chat/useCase/orchestration/chat.service';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

/** Shared error message — keeps sonarjs/no-duplicate-string happy. */
const MESSAGE_ID_REQUIRED = 'messageId param is required';

/** Handler factory: POST /sessions/:id/audio */
function createAudioHandler(chatService: ChatService) {
  return async (req: Request, res: Response) => {
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

    const sessionId = parseStringParam(req, 'id');
    if (!sessionId) {
      throw badRequest('session id param is required');
    }

    const result = await chatService.postAudioMessage(
      sessionId,
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
      req.ip,
    );

    res.status(201).json(result);
  };
}

/** Handler factory: GET /messages/:messageId/image */
function createImageServeHandler(chatService: ChatService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const messageId = parseStringParam(req, 'messageId');
    if (!messageId) {
      throw badRequest(MESSAGE_ID_REQUIRED);
    }
    const verification = verifySignedChatImageReadUrl({
      messageId,
      token: typeof req.query.token === 'string' ? req.query.token : undefined,
      signature: typeof req.query.sig === 'string' ? req.query.sig : undefined,
    });

    if (!verification.ok) {
      throw badRequest(verification.reason);
    }

    // HMAC + TTL already verified above — authorization is delegated to the signed token.
    // Use the bypass path so we don't re-enforce session ownership against an anonymous req.
    const image = await chatService.getMessageImageRefBySignedToken(messageId);
    if (isS3ImageRef(image.imageRef)) {
      const signed = buildImageReadUrl({
        baseUrl: resolveRequestBaseUrl(req),
        messageId,
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
  };
}

/** Handler factory: POST /messages/:messageId/report */
function createReportHandler(chatService: ChatService) {
  return async (req: Request, res: Response) => {
    const currentUser = getRequestUser(req);
    if (!currentUser?.id) {
      throw new AppError({ message: 'Token required', statusCode: 401, code: 'UNAUTHORIZED' });
    }
    const messageId = parseStringParam(req, 'messageId');
    if (!messageId) {
      throw badRequest(MESSAGE_ID_REQUIRED);
    }
    const payload = parseReportMessageRequest(req.body ?? {});
    const result = await chatService.reportMessage(
      messageId,
      payload.reason,
      currentUser.id,
      payload.comment,
    );
    res.status(201).json(result);
  };
}

/** Handler factory: POST /messages/:messageId/feedback */
function createFeedbackHandler(chatService: ChatService) {
  return async (req: Request, res: Response) => {
    const currentUser = getRequestUser(req);
    if (!currentUser?.id) {
      throw new AppError({ message: 'Token required', statusCode: 401, code: 'UNAUTHORIZED' });
    }
    const messageId = parseStringParam(req, 'messageId');
    if (!messageId) {
      throw badRequest(MESSAGE_ID_REQUIRED);
    }
    const payload = parseFeedbackMessageRequest(req.body ?? {});
    const result = await chatService.setMessageFeedback(messageId, currentUser.id, payload.value);
    res.status(200).json(result);
  };
}

/** Handler factory: POST /messages/:messageId/image-url */
function createImageUrlHandler(chatService: ChatService) {
  return async (req: Request, res: Response) => {
    const currentUser = getRequestUser(req);
    const messageId = parseStringParam(req, 'messageId');
    if (!messageId) {
      throw badRequest(MESSAGE_ID_REQUIRED);
    }
    const image = await chatService.getMessageImageRef(messageId, currentUser?.id);
    const signed = buildImageReadUrl({
      baseUrl: resolveRequestBaseUrl(req),
      messageId,
      imageRef: image.imageRef,
    });
    if (!signed) {
      throw badRequest('Unable to generate image URL for current storage backend');
    }
    res.status(200).json(signed);
  };
}

/** Handler factory: POST /messages/:messageId/tts */
function createTtsHandler(chatService: ChatService) {
  return async (req: Request, res: Response) => {
    const currentUser = getRequestUser(req);
    const messageId = parseStringParam(req, 'messageId');
    if (!messageId) {
      throw badRequest(MESSAGE_ID_REQUIRED);
    }
    const result = await chatService.synthesizeSpeech(messageId, currentUser?.id);
    if (!result) {
      res.status(204).end();
      return;
    }
    res.set('Content-Type', result.contentType);
    res.set('Content-Length', String(result.audio.length));
    // nosemgrep: javascript.express.security.audit.xss.direct-response-write.direct-response-write -- binary audio Buffer from TTS service, not user-controlled HTML
    res.send(result.audio);
  };
}

/**
 * Creates the media sub-router (audio upload, image serving, report, TTS).
 *
 * @param chatService - Injected chat application service.
 * @param uploadAdmission - Shared upload-admission middleware (concurrency limiter).
 * @returns Router handling audio, image, report, and TTS endpoints.
 */
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

  // SEC-20: per-authenticated-user limiter (see chat-message.route.ts).
  const userLimiter = createRateLimitMiddleware({
    limit: env.rateLimit.userLimit,
    windowMs: env.rateLimit.windowMs,
    keyGenerator: byUserId,
  });

  router.post(
    '/sessions/:id/audio',
    isAuthenticated,
    dailyChatLimit,
    userLimiter,
    sessionLimiter,
    // P0-4 (audit 2026-05-12 §P0-U-2) — kill-switch + per-user daily USD cap.
    // Audio turn triggers STT + LLM + TTS, all paid OpenAI calls. Placed AFTER
    // rate limiters so volume control runs first (cheaper failure path) and
    // BEFORE upload admission so a denied call does not occupy a multipart slot.
    llmCostGuard,
    ...(uploadAdmission ? [uploadAdmission] : []),
    audioUpload.single('audio'),
    createAudioHandler(chatService),
  );
  router.post(
    '/messages/:messageId/report',
    isAuthenticated,
    userLimiter,
    createReportHandler(chatService),
  );
  router.post(
    '/messages/:messageId/feedback',
    isAuthenticated,
    userLimiter,
    createFeedbackHandler(chatService),
  );
  router.post(
    '/messages/:messageId/image-url',
    isAuthenticated,
    userLimiter,
    createImageUrlHandler(chatService),
  );
  router.post(
    '/messages/:messageId/tts',
    isAuthenticated,
    userLimiter,
    sessionLimiter,
    // P0-4 (audit 2026-05-12 §P0-U-2) — paid OpenAI TTS call. Same chokepoint
    // as the audio handler so the kill-switch globally gates every paid
    // outbound LLM/audio call on this router.
    llmCostGuard,
    createTtsHandler(chatService),
  );
  router.get('/messages/:messageId/image', createImageServeHandler(chatService));

  return router;
};
