import { Router } from 'express';

import { createUploadAdmissionMiddleware } from '@src/helpers/middleware/upload-admission.middleware';

import { createDescribeRouter } from './chat-describe.route';
import { createMediaRouter } from './chat-media.route';
import { createMemoryRouter } from './chat-memory.route';
import { createMessageRouter } from './chat-message.route';
import { createSessionRouter } from './chat-session.route';

import type { ArtKeywordRepository } from '../../../domain/artKeyword.repository.interface';
import type { ChatService } from '../../../useCase/chat.service';
import type { DescribeService } from '../../../useCase/describe.service';
import type { UserMemoryService } from '../../../useCase/user-memory.service';

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
  userMemoryService?: UserMemoryService,
  describeService?: DescribeService,
): Router => {
  const router = Router();

  // Single shared upload-admission middleware instance so the concurrency
  // counter is consistent across all sub-routers (message + media).
  const uploadAdmission = createUploadAdmissionMiddleware();

  router.use('/', createSessionRouter(chatService));
  router.use('/', createMessageRouter(chatService, artKeywordRepo, uploadAdmission));
  router.use('/', createMediaRouter(chatService, uploadAdmission));
  if (userMemoryService) {
    router.use('/', createMemoryRouter(userMemoryService));
  }
  if (describeService) {
    router.use('/', createDescribeRouter(describeService));
  }

  return router;
};
