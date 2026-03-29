import { Router } from 'express';

import { createUploadAdmissionMiddleware } from '@src/helpers/middleware/upload-admission.middleware';

import { createMediaRouter } from './chat-media.route';
import { createMessageRouter } from './chat-message.route';
import { createSessionRouter } from './chat-session.route';

import type { ChatService } from '../../../application/chat.service';
import type { ArtKeywordRepository } from '../../../domain/artKeyword.repository.interface';

/**
 * Builds Express router for chat endpoints by composing session, message, and media sub-routers.
 *
 * @param chatService - Injected chat application service.
 * @param artKeywordRepo - Optional art keyword repository for keyword endpoints.
 * @returns Configured Express Router.
 */
export const createChatRouter = (
  chatService: ChatService,
  artKeywordRepo?: ArtKeywordRepository,
): Router => {
  const router = Router();

  // Single shared upload-admission middleware instance so the concurrency
  // counter is consistent across all sub-routers (message + media).
  const uploadAdmission = createUploadAdmissionMiddleware();

  router.use('/', createSessionRouter(chatService));
  router.use('/', createMessageRouter(chatService, artKeywordRepo, uploadAdmission));
  router.use('/', createMediaRouter(chatService, uploadAdmission));

  return router;
};
