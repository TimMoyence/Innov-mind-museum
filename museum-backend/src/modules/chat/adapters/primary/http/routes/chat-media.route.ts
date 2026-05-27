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
import { resolveActiveProviderForScope } from '@modules/chat/useCase/orchestration/provider-resolver';
import { buildThirdPartyAiConsentChecker } from '@modules/chat/useCase/third-party-ai-consent-checker';
import { badRequest } from '@shared/errors/app.error';
import { requireUser } from '@shared/http/requireUser';
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
import type { ThirdPartyAiConsentChecker } from '@modules/chat/useCase/third-party-ai-consent-checker';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

const MESSAGE_ID_REQUIRED = 'messageId param is required';

function createAudioHandler(chatService: ChatService, consentChecker: ThirdPartyAiConsentChecker) {
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

    // B7 (R4/R5/R6) — gate STT on `third_party_ai_audio_<provider>` BEFORE
    // any external (OpenAI Whisper) call. Runs AFTER isAuthenticated +
    // rate-limit + costGuard + multer (middleware order preserved); the
    // check is read-only so the "mutating middleware ordering" gotcha
    // (CLAUDE.md) does not regress.
    const { scope: audioScope } = resolveActiveProviderForScope('audio');
    const granted = await consentChecker.isGranted(currentUser?.id, audioScope);
    if (!granted) {
      res.status(403).json({ error: 'consent_required', scope: audioScope });
      return;
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

    // Auth delegated to signed token (HMAC+TTL verified above); bypass session ownership check.
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

function createReportHandler(chatService: ChatService) {
  return async (req: Request, res: Response) => {
    const user = requireUser(req);
    const messageId = parseStringParam(req, 'messageId');
    if (!messageId) {
      throw badRequest(MESSAGE_ID_REQUIRED);
    }
    const payload = parseReportMessageRequest(req.body ?? {});
    const result = await chatService.reportMessage(
      messageId,
      payload.reason,
      user.id,
      payload.comment,
    );
    res.status(201).json(result);
  };
}

function createFeedbackHandler(chatService: ChatService) {
  return async (req: Request, res: Response) => {
    const user = requireUser(req);
    const messageId = parseStringParam(req, 'messageId');
    if (!messageId) {
      throw badRequest(MESSAGE_ID_REQUIRED);
    }
    const payload = parseFeedbackMessageRequest(req.body ?? {});
    const result = await chatService.setMessageFeedback(messageId, user.id, payload.value);
    res.status(200).json(result);
  };
}

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

function createTtsHandler(chatService: ChatService, consentChecker: ThirdPartyAiConsentChecker) {
  return async (req: Request, res: Response) => {
    const currentUser = getRequestUser(req);
    const messageId = parseStringParam(req, 'messageId');
    if (!messageId) {
      throw badRequest(MESSAGE_ID_REQUIRED);
    }

    // B1 (R1/R2/R3) — gate TTS on `third_party_ai_audio_<provider>` BEFORE the
    // assistant text is sent to the external OpenAI TTS service. Mirrors the
    // STT gate (createAudioHandler above): same scope, same 403 refusal shape,
    // read-only so the "mutating middleware ordering" gotcha does not regress.
    const { scope: audioScope } = resolveActiveProviderForScope('audio');
    const granted = await consentChecker.isGranted(currentUser?.id, audioScope);
    if (!granted) {
      res.status(403).json({ error: 'consent_required', scope: audioScope });
      return;
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

export const createMediaRouter = (
  chatService: ChatService,
  uploadAdmission?: RequestHandler,
  consentChecker: ThirdPartyAiConsentChecker = buildThirdPartyAiConsentChecker(),
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
    // P0-4 — gates STT+LLM+TTS USD spend; ordering: AFTER rate-limit (cheap fail), BEFORE admission (don't take slot).
    llmCostGuard,
    ...(uploadAdmission ? [uploadAdmission] : []),
    audioUpload.single('audio'),
    createAudioHandler(chatService, consentChecker),
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
    // P0-4 — TTS paid call; same chokepoint as audio handler.
    llmCostGuard,
    createTtsHandler(chatService, consentChecker),
  );
  // P0-CodeQL — image serve was unrate-limited; an attacker could hammer
  // signed-URL guessing or cause backend egress amplification.
  router.get('/messages/:messageId/image', userLimiter, createImageServeHandler(chatService));

  return router;
};
